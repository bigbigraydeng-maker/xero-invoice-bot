/**
 * Xero API 模块 - 多用户版本
 * 支持每个用户独立的 Xero 授权和 Token 管理
 */

const axios = require('axios');
const logger = require('./utils/logger');
const { handleXeroError } = require('./utils/error-handler');
const { getBASPeriod, getPeriodDescription } = require('./utils/bas-period');
const db = require('./db');

// Xero 配置
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const REDIRECT_URI = process.env.XERO_REDIRECT_URI || 'https://xero-invoice-bot-1.onrender.com/xero/callback';

// Xero API endpoints
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

// Scopes for Xero API
const SCOPES = 'openid profile email accounting.transactions accounting.contacts accounting.reports.read accounting.settings.read offline_access';

// 临时存储授权状态（用于关联回调和用户）
const authStates = new Map();

/**
 * 生成授权 URL
 * @param {string} userId - 内部用户ID
 * @returns {string} 授权 URL
 */
function generateAuthUrl(userId) {
    const state = generateState();
    authStates.set(state, { userId, createdAt: Date.now() });
    
    // 清理过期状态（10分钟后过期）
    setTimeout(() => authStates.delete(state), 10 * 60 * 1000);
    
    const params = new URLSearchParams({
        response_type: 'code',
        client_id: XERO_CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
        state: state
    });
    
    return `${XERO_AUTH_URL}?${params.toString()}`;
}

/**
 * 生成随机 state
 */
function generateState() {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
}

/**
 * 处理授权回调
 * @param {string} code - 授权码
 * @param {string} state - 状态码
 * @returns {object} 结果
 */
async function handleCallback(code, state) {
    const stateData = authStates.get(state);
    if (!stateData) {
        return { success: false, error: 'Invalid or expired state' };
    }
    
    const { userId } = stateData;
    authStates.delete(state);
    
    try {
        // 交换 code 获取 token
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('client_id', XERO_CLIENT_ID);
        params.append('client_secret', XERO_CLIENT_SECRET);
        
        const response = await axios.post(XERO_TOKEN_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        if (response.status === 200) {
            const tokens = response.data;
            const expiresAt = Date.now() + (tokens.expires_in * 1000);
            
            // 获取租户信息
            const connections = await getConnections(tokens.access_token);
            const tenant = connections && connections.length > 0 ? connections[0] : null;
            
            // 保存到数据库
            db.saveXeroToken(userId, {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: expiresAt,
                tenant_id: tenant ? tenant.tenantId : null,
                tenant_name: tenant ? tenant.tenantName : null
            });
            
            logger.info('Xero authorization successful', { userId, tenant: tenant?.tenantName });
            return { 
                success: true, 
                tenantName: tenant?.tenantName,
                message: `成功连接到 Xero: ${tenant?.tenantName || '未命名组织'}`
            };
        }
    } catch (error) {
        logger.error('Xero authorization failed', error);
        return { 
            success: false, 
            error: error.response?.data?.error_description || error.message 
        };
    }
}

/**
 * 获取 Xero 连接（租户列表）
 */
async function getConnections(accessToken) {
    try {
        const response = await axios.get(XERO_CONNECTIONS_URL, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        return response.data;
    } catch (error) {
        logger.error('Failed to get connections', error);
        return [];
    }
}

/**
 * 获取有效的 access token（带自动刷新）
 * @param {string} userId - 内部用户ID
 * @returns {string|null} access token
 */
async function getValidToken(userId) {
    const tokenData = db.getXeroToken(userId);
    
    if (!tokenData) {
        logger.warn('No Xero token found for user', { userId });
        return null;
    }
    
    // 检查是否过期（提前 5 分钟刷新）
    if (Date.now() < tokenData.expires_at - 5 * 60 * 1000) {
        logger.debug('Token not expired, using cached token', { userId });
        return tokenData.access_token;
    }
    
    // Token 过期，尝试刷新
    logger.info('Token expired, attempting refresh', { userId });
    try {
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', tokenData.refresh_token);
        params.append('client_id', XERO_CLIENT_ID);
        params.append('client_secret', XERO_CLIENT_SECRET);
        
        const response = await axios.post(XERO_TOKEN_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        
        if (response.status === 200) {
            const tokens = response.data;
            const expiresAt = Date.now() + (tokens.expires_in * 1000);
            
            // 更新数据库
            db.saveXeroToken(userId, {
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expires_at: expiresAt,
                tenant_id: tokenData.tenant_id,
                tenant_name: tokenData.tenant_name
            });
            
            logger.info('Token refreshed successfully', { userId });
            return tokens.access_token;
        }
    } catch (error) {
        logger.error('Token refresh failed', { userId, error: error.message });
        
        // 如果是 invalid_grant，需要重新授权
        if (error.response?.data?.error === 'invalid_grant') {
            logger.error('Refresh token expired, need re-authorization', { userId });
            db.deleteXeroToken(userId);
        }
    }
    
    return null;
}

/**
 * 检查用户是否已连接 Xero
 * @param {string} userId - 内部用户ID
 */
function isConnected(userId) {
    const tokenData = db.getXeroToken(userId);
    return !!tokenData;
}

/**
 * 断开 Xero 连接
 * @param {string} userId - 内部用户ID
 */
function disconnect(userId) {
    return db.deleteXeroToken(userId);
}

/**
 * 获取租户 ID
 * @param {string} userId - 内部用户ID
 */
function getTenantId(userId) {
    const tokenData = db.getXeroToken(userId);
    return tokenData ? tokenData.tenant_id : null;
}

// ==================== API 调用函数 ====================

/**
 * 调用 Xero API
 * @param {string} userId - 内部用户ID
 * @param {string} endpoint - API 端点
 * @param {string} method - HTTP 方法
 * @param {object} data - 请求数据
 */
async function callXeroApi(userId, endpoint, method = 'GET', data = null) {
    const accessToken = await getValidToken(userId);
    if (!accessToken) {
        throw new Error('XERO_NOT_CONNECTED');
    }
    
    const tenantId = getTenantId(userId);
    if (!tenantId) {
        throw new Error('XERO_NO_TENANT');
    }
    
    const url = `${XERO_API_BASE}${endpoint}`;
    const config = {
        method,
        url,
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Xero-tenant-id': tenantId,
            'Accept': 'application/json'
        }
    };
    
    if (data && (method === 'POST' || method === 'PUT')) {
        config.data = data;
    }
    
    try {
        const response = await axios(config);
        return response.data;
    } catch (error) {
        handleXeroError(error);
        throw error;
    }
}

/**
 * 获取联系人列表
 * @param {string} userId - 内部用户ID
 */
async function getContacts(userId) {
    return callXeroApi(userId, '/Contacts');
}

/**
 * 创建联系人
 * @param {string} userId - 内部用户ID
 * @param {object} contactData - 联系人数据
 */
async function createContact(userId, contactData) {
    return callXeroApi(userId, '/Contacts', 'POST', { Contacts: [contactData] });
}

/**
 * 创建发票
 * @param {string} userId - 内部用户ID
 * @param {object} invoiceData - 发票数据
 */
async function createInvoice(userId, invoiceData) {
    return callXeroApi(userId, '/Invoices', 'POST', { Invoices: [invoiceData] });
}

/**
 * 获取发票列表
 * @param {string} userId - 内部用户ID
 * @param {string} status - 发票状态（可选）
 */
async function getInvoices(userId, status = null) {
    let endpoint = '/Invoices';
    if (status) {
        endpoint += `?where=Status%3D%22${status}%22`;
    }
    return callXeroApi(userId, endpoint);
}

/**
 * 获取账户余额
 * @param {string} userId - 内部用户ID
 */
async function getBankTransactions(userId) {
    return callXeroApi(userId, '/BankTransactions');
}

/**
 * 获取报告
 * @param {string} userId - 内部用户ID
 * @param {string} reportType - 报告类型
 */
async function getReports(userId, reportType = 'BalanceSheet') {
    return callXeroApi(userId, `/Reports/${reportType}`);
}

/**
 * 获取 BAS/GST 报告
 * @param {string} userId - 内部用户ID
 * @param {string} period - 报告期间
 */
async function getBASReport(userId, period = null) {
    const now = new Date();
    const basPeriod = period || getBASPeriod(now);
    
    logger.info('Getting BAS report', { userId, period: basPeriod });
    
    try {
        // 获取发票数据用于计算 GST
        const invoices = await getInvoices(userId);
        
        // 计算 GST
        let totalGST = 0;
        let totalSales = 0;
        
        if (invoices && invoices.Invoices) {
            invoices.Invoices.forEach(inv => {
                if (inv.Status === 'AUTHORISED' || inv.Status === 'PAID') {
                    totalSales += inv.Total || 0;
                    // Xero 发票中通常包含 GST 在 TotalTax 字段
                    totalGST += inv.TotalTax || 0;
                }
            });
        }
        
        return {
            period: basPeriod,
            description: getPeriodDescription(basPeriod),
            totalSales: totalSales,
            totalGST: totalGST,
            invoiceCount: invoices?.Invoices?.length || 0
        };
    } catch (error) {
        logger.error('Failed to get BAS report', { userId, error: error.message });
        throw error;
    }
}

/**
 * 健康检查
 * @param {string} userId - 内部用户ID（可选）
 */
async function healthCheck(userId = null) {
    try {
        if (userId) {
            // 检查特定用户
            const connected = isConnected(userId);
            const tokenData = db.getXeroToken(userId);
            
            return {
                status: connected ? 'connected' : 'disconnected',
                connected: connected,
                tenantName: tokenData?.tenant_name || null,
                lastUpdated: tokenData?.updated_at || null
            };
        } else {
            // 检查整体状态
            const allUsers = db.getAllXeroUsers();
            return {
                status: 'ok',
                totalConnectedUsers: allUsers.length,
                message: `${allUsers.length} 个用户已连接 Xero`
            };
        }
    } catch (error) {
        logger.error('Health check failed', error);
        return { status: 'error', error: error.message };
    }
}

module.exports = {
    // 授权相关
    generateAuthUrl,
    handleCallback,
    isConnected,
    disconnect,
    
    // Token 管理
    getValidToken,
    getTenantId,
    
    // API 调用
    callXeroApi,
    getContacts,
    createContact,
    createInvoice,
    getInvoices,
    getBankTransactions,
    getReports,
    getBASReport,
    
    // 工具
    healthCheck
};
