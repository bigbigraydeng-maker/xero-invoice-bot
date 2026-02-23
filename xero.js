/**
 * Xero API 模块 - Node.js 版本
 * 从 Python Flask 服务翻译而来
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const logger = require('./utils/logger');
const { handleXeroError } = require('./utils/error-handler');
const { getBASPeriod, getPeriodDescription } = require('./utils/bas-period');

// 配置
// 根据环境选择 token 存储路径
// Render disk 挂载在 /data
// 本地开发使用 ./data
const TOKEN_FILE = process.env.RENDER_DISK_PATH 
    ? path.join(process.env.RENDER_DISK_PATH, 'tokens.json')
    : path.join(__dirname, 'data', 'tokens.json');
const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID;
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET;
const REDIRECT_URI = process.env.XERO_REDIRECT_URI || 'https://xero-invoice-bot.onrender.com/callback';

// Xero API endpoints
const XERO_AUTH_URL = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN_URL = 'https://identity.xero.com/connect/token';
const XERO_CONNECTIONS_URL = 'https://api.xero.com/connections';
const XERO_API_BASE = 'https://api.xero.com/api.xro/2.0';

// Scopes for Xero API
// 包含所有需要的权限：交易、联系人、报告、设置
const SCOPES = 'openid profile email accounting.transactions accounting.contacts accounting.reports.read accounting.settings.read offline_access';

// 确保数据目录存在
function ensureDataDir() {
    // 根据 TOKEN_FILE 的路径确定数据目录
    const dataDir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dataDir)) {
        logger.info('Creating data directory', { path: dataDir });
        fs.mkdirSync(dataDir, { recursive: true });
    }
}

/**
 * 加载 tokens
 */
function loadTokens() {
    ensureDataDir();
    if (fs.existsSync(TOKEN_FILE)) {
        const data = fs.readFileSync(TOKEN_FILE, 'utf-8');
        return JSON.parse(data);
    }
    return {};
}

/**
 * 保存 tokens
 */
function saveTokens(tokens) {
    ensureDataDir();
    // 添加保存时间戳
    const tokensWithTimestamp = {
        ...tokens,
        saved_at: new Date().toISOString()
    };
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokensWithTimestamp, null, 2));
    logger.info('Tokens saved successfully');
}

/**
 * 检查 token 是否需要重新授权
 * Xero refresh token 60 天过期
 */
function checkTokenStatus() {
    const tokens = loadTokens();
    if (!tokens.saved_at) {
        return { valid: false, reason: 'no_timestamp', message: 'Token 无时间戳，建议重新授权' };
    }
    
    const savedAt = new Date(tokens.saved_at);
    const now = new Date();
    const daysSinceSaved = (now - savedAt) / (1000 * 60 * 60 * 24);
    
    // Xero refresh token 60 天过期，提前 7 天提醒
    const daysUntilExpiry = 60 - daysSinceSaved;
    
    if (daysUntilExpiry <= 0) {
        return { 
            valid: false, 
            reason: 'refresh_token_expired', 
            message: 'Refresh token 已过期（超过60天），需要重新授权',
            days_since_saved: Math.floor(daysSinceSaved)
        };
    } else if (daysUntilExpiry <= 7) {
        return { 
            valid: true, 
            reason: 'expiring_soon', 
            message: `Refresh token 即将过期（${Math.floor(daysUntilExpiry)}天后），建议重新授权`,
            days_until_expiry: Math.floor(daysUntilExpiry)
        };
    }
    
    return { 
        valid: true, 
        reason: 'ok', 
        message: 'Token 状态正常',
        days_until_expiry: Math.floor(daysUntilExpiry)
    };
}

/**
 * 刷新 access token
 */
async function refreshAccessToken(refreshToken) {
    try {
        // 使用 URLSearchParams 构建 form-urlencoded 数据
        const params = new URLSearchParams();
        params.append('grant_type', 'refresh_token');
        params.append('refresh_token', refreshToken);
        params.append('client_id', XERO_CLIENT_ID);
        params.append('client_secret', XERO_CLIENT_SECRET);

        const response = await axios.post(XERO_TOKEN_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (response.status === 200) {
            const tokens = response.data;
            saveTokens(tokens);
            logger.info('Token refreshed successfully');
            return tokens;
        }
    } catch (error) {
        logger.error('Failed to refresh token', error);
        if (error.response) {
            logger.error('Token refresh error details', null, { 
                status: error.response.status,
                data: error.response.data 
            });
        }
    }
    return null;
}

/**
 * 获取有效的 access token
 * 增强版：添加详细日志和错误处理
 */
async function getValidToken() {
    const tokens = loadTokens();

    if (!tokens || Object.keys(tokens).length === 0) {
        logger.warn('No tokens found in storage');
        return null;
    }

    const accessToken = tokens.access_token;
    const refreshToken = tokens.refresh_token;
    const expiresAt = tokens.expires_at;
    
    logger.info('Token status check', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : 'unknown',
        now: new Date().toISOString()
    });

    // 先检查是否已过期（基于时间）
    if (expiresAt && Date.now() < expiresAt - 60000) { // 提前1分钟刷新
        logger.debug('Token not expired based on timestamp, using cached token');
        return accessToken;
    }

    if (accessToken) {
        // 测试 token 是否有效
        try {
            logger.debug('Testing access token validity...');
            const response = await axios.get(XERO_CONNECTIONS_URL, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                timeout: 10000
            });

            if (response.status === 200) {
                logger.info('Access token is valid');
                return accessToken;
            }
        } catch (error) {
            logger.info('Access token test failed', {
                error: error.response?.status,
                message: error.message
            });
        }
    }

    // Token 过期或无效，尝试刷新
    if (refreshToken) {
        logger.info('Attempting to refresh access token...');
        try {
            const newTokens = await refreshAccessToken(refreshToken);
            if (newTokens && newTokens.access_token) {
                logger.info('Token refreshed successfully');
                return newTokens.access_token;
            }
        } catch (error) {
            logger.error('Token refresh failed', error);
            
            // 检查是否是 refresh_token 过期
            if (error.message?.includes('invalid_grant')) {
                logger.error('Refresh token has expired, need re-authorization');
                throw new Error('XERO_REFRESH_TOKEN_EXPIRED');
            }
        }
    }

    logger.error('Failed to get valid token, re-authorization required');
    return null;
}

/**
 * 获取 tenant ID
 */
async function getTenantId(accessToken) {
    try {
        const response = await axios.get(XERO_CONNECTIONS_URL, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (response.status === 200) {
            const connections = response.data;
            if (connections && connections.length > 0) {
                return connections[0].tenantId;
            }
        }
    } catch (error) {
        console.error('获取 tenant ID 失败:', error.message);
    }
    return null;
}

/**
 * 获取认证 URL
 */
function getAuthUrl() {
    const scopesEncoded = encodeURIComponent(SCOPES);
    return `${XERO_AUTH_URL}?response_type=code&client_id=${XERO_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${scopesEncoded}`;
}

/**
 * 处理 OAuth 回调
 */
async function handleCallback(code) {
    try {
        // 调试信息
        console.log('Xero token request:', {
            client_id: XERO_CLIENT_ID,
            client_secret: XERO_CLIENT_SECRET ? 'present (length: ' + XERO_CLIENT_SECRET.length + ')' : 'missing',
            redirect_uri: REDIRECT_URI,
            code: code.substring(0, 10) + '...'
        });

        // 使用 URLSearchParams 构建 form-urlencoded 数据
        const params = new URLSearchParams();
        params.append('grant_type', 'authorization_code');
        params.append('code', code);
        params.append('redirect_uri', REDIRECT_URI);
        params.append('client_id', XERO_CLIENT_ID);
        params.append('client_secret', XERO_CLIENT_SECRET);

        console.log('Request body:', params.toString().replace(XERO_CLIENT_SECRET, '***'));

        const response = await axios.post(XERO_TOKEN_URL, params.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        if (response.status === 200) {
            const tokens = response.data;
            saveTokens(tokens);
            console.log('✅ Xero 授权成功，token 已保存');
            return tokens;
        }
    } catch (error) {
        console.error('处理回调失败:', error.message);
        if (error.response) {
            console.error('错误详情:', error.response.data);
        }
        throw error;
    }
}

/**
 * 获取应收账款汇总
 */
async function getReceivablesSummary() {
    logger.info('Getting receivables summary');
    
    const accessToken = await getValidToken();
    if (!accessToken) {
        logger.warn('Cannot get receivables: not authenticated');
        throw new Error('XERO_NOT_AUTHENTICATED');
    }

    const tenantId = await getTenantId(accessToken);
    if (!tenantId) {
        logger.warn('Cannot get receivables: no tenant found');
        throw new Error('XERO_NO_TENANT');
    }

    try {
        const response = await axios.get(`${XERO_API_BASE}/Invoices`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            },
            params: { where: 'Type=="ACCREC" AND Status!="PAID"' },
            timeout: 30000 // 30秒超时
        });

        if (response.status === 200) {
            const data = response.data;
            const invoices = data.Invoices || [];

            let totalReceivable = 0;
            const byCustomer = {};

            for (const invoice of invoices) {
                const amount = invoice.AmountDue || 0;
                totalReceivable += amount;

                const customer = invoice.Contact?.Name || 'Unknown';
                if (!byCustomer[customer]) {
                    byCustomer[customer] = { amount: 0, count: 0 };
                }
                byCustomer[customer].amount += amount;
                byCustomer[customer].count += 1;
            }

            logger.info('Receivables summary retrieved', { 
                total: totalReceivable, 
                count: invoices.length 
            });

            return {
                total_receivable: totalReceivable,
                invoice_count: invoices.length,
                by_customer: byCustomer
            };
        }
    } catch (error) {
        logger.error('Failed to get receivables summary', error);
        throw handleXeroError(error);
    }
}

/**
 * 创建发票
 */
async function createInvoice(data) {
    const accessToken = await getValidToken();
    if (!accessToken) {
        throw new Error('Not authenticated');
    }

    const tenantId = await getTenantId(accessToken);
    if (!tenantId) {
        throw new Error('No tenant found');
    }

    const now = new Date();
    const dueDate = new Date(now);
    dueDate.setDate(dueDate.getDate() + 30);

    const invoiceData = {
        Type: 'ACCREC',
        Contact: {
            Name: data.customer_name || 'Customer'
        },
        Date: data.date || now.toISOString().split('T')[0],
        DueDate: data.due_date || dueDate.toISOString().split('T')[0],
        LineItems: data.line_items || [{
            Description: data.description || 'Service',
            Quantity: data.quantity || 1,
            UnitAmount: data.unit_amount || 0,
            AccountCode: data.account_code || '200'
        }],
        Status: data.status || 'DRAFT'
    };

    try {
        const response = await axios.put(`${XERO_API_BASE}/Invoices`, invoiceData, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        if (response.status === 200 || response.status === 201) {
            const result = response.data;
            return {
                success: true,
                invoice: result.Invoices?.[0]
            };
        }
    } catch (error) {
        console.error('创建发票失败:', error.message);
        throw error;
    }
}

/**
 * 获取所有发票
 */
async function getAllInvoices(status = '', page = 1) {
    const accessToken = await getValidToken();
    if (!accessToken) {
        throw new Error('Not authenticated');
    }

    const tenantId = await getTenantId(accessToken);
    if (!tenantId) {
        throw new Error('No tenant found');
    }

    const params = { page: page };
    if (status) {
        params.where = `Status=="${status}"`;
    }

    try {
        const response = await axios.get(`${XERO_API_BASE}/Invoices`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            },
            params: params
        });

        if (response.status === 200) {
            const data = response.data;
            const invoices = data.Invoices || [];

            const simplified = invoices.map(inv => ({
                invoice_id: inv.InvoiceID,
                invoice_number: inv.InvoiceNumber,
                type: inv.Type,
                status: inv.Status,
                date: inv.Date,
                due_date: inv.DueDate,
                total: inv.Total,
                amount_due: inv.AmountDue,
                amount_paid: inv.AmountPaid,
                customer: inv.Contact?.Name,
                reference: inv.Reference
            }));

            return {
                invoices: simplified,
                count: simplified.length
            };
        }
    } catch (error) {
        console.error('获取发票列表失败:', error.message);
        throw error;
    }
}

/**
 * 获取所有客户
 */
async function getAllCustomers(page = 1) {
    const accessToken = await getValidToken();
    if (!accessToken) {
        throw new Error('Not authenticated');
    }

    const tenantId = await getTenantId(accessToken);
    if (!tenantId) {
        throw new Error('No tenant found');
    }

    try {
        const response = await axios.get(`${XERO_API_BASE}/Contacts`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            },
            params: { page: page }
        });

        if (response.status === 200) {
            const data = response.data;
            const contacts = data.Contacts || [];

            const customers = contacts.map(contact => ({
                contact_id: contact.ContactID,
                name: contact.Name,
                email: contact.EmailAddress,
                phone: contact.Phones?.[0]?.PhoneNumber,
                address: contact.Addresses?.[0]?.AddressLine1,
                balance: contact.Balances?.AccountsReceivable?.Outstanding || 0,
                is_customer: contact.IsCustomer !== false,
                is_supplier: contact.IsSupplier === true
            }));

            return {
                customers: customers,
                count: customers.length
            };
        }
    } catch (error) {
        console.error('获取客户列表失败:', error.message);
        throw error;
    }
}

/**
 * 获取客户发票
 */
async function getCustomerInvoices(customerName) {
    const accessToken = await getValidToken();
    if (!accessToken) {
        throw new Error('Not authenticated');
    }

    const tenantId = await getTenantId(accessToken);
    if (!tenantId) {
        throw new Error('No tenant found');
    }

    try {
        // 先获取所有发票，然后过滤
        const response = await axios.get(`${XERO_API_BASE}/Invoices`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            }
        });

        if (response.status === 200) {
            const data = response.data;
            const invoices = data.Invoices || [];

            // 过滤指定客户的发票
            const customerInvoices = invoices.filter(inv => 
                inv.Contact?.Name?.toLowerCase().includes(customerName.toLowerCase())
            );

            const simplified = customerInvoices.map(inv => ({
                invoice_id: inv.InvoiceID,
                invoice_number: inv.InvoiceNumber,
                status: inv.Status,
                date: inv.Date,
                due_date: inv.DueDate,
                total: inv.Total,
                amount_due: inv.AmountDue,
                amount_paid: inv.AmountPaid,
                reference: inv.Reference
            }));

            return {
                customer: customerName,
                invoices: simplified,
                count: simplified.length
            };
        }
    } catch (error) {
        console.error('获取客户发票失败:', error.message);
        throw error;
    }
}

/**
 * 健康检查
 */
async function healthCheck() {
    try {
        // 先检查 token 状态
        const tokenStatus = checkTokenStatus();
        
        const accessToken = await getValidToken();
        if (!accessToken) {
            return { 
                status: 'not_authenticated',
                token_status: tokenStatus
            };
        }

        const tenantId = await getTenantId(accessToken);
        return {
            status: 'authenticated',
            tenant_id: tenantId,
            token_status: tokenStatus
        };
    } catch (error) {
        return { status: 'error', message: error.message };
    }
}

/**
 * 获取 BAS/GST 报告（智能解读版）
 * 从 Xero 读取税务数据，用中文解读
 */
async function getBASReport() {
    const accessToken = await getValidToken();
    if (!accessToken) {
        throw new Error('Not authenticated');
    }

    const tenantId = await getTenantId(accessToken);
    if (!tenantId) {
        throw new Error('No tenant found');
    }

    try {
        // 获取组织信息以确定地区（AU 或 NZ）
        const orgResponse = await axios.get(`${XERO_API_BASE}/Organisation`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            }
        });

        const organisation = orgResponse.data.Organisations?.[0];
        const country = organisation?.Country || 'AU';
        const isAustralia = country === 'AU' || country === 'Australia';
        const isNewZealand = country === 'NZ' || country === 'New Zealand';

        // 获取当前财政年度
        const now = new Date();
        const fiscalYear = organisation?.FinancialYearEndDay 
            ? `${now.getFullYear()}-${String(organisation.FinancialYearEndMonth).padStart(2, '0')}-${String(organisation.FinancialYearEndDay).padStart(2, '0')}`
            : null;

        // ✅ 修正：获取上一个完整的申报周期（而不是"到今天"）
        // 默认使用季度申报，可以从配置中读取
        const basFrequency = process.env.BAS_FREQUENCY || 'quarterly'; // monthly 或 quarterly
        const period = getBASPeriod({
            frequency: basFrequency,
            country: isAustralia ? 'AU' : (isNewZealand ? 'NZ' : 'AU'),
            now: now
        });
        
        const fromDate = period.startDate;
        const toDate = period.endDate;
        
        logger.info('BAS period calculated', { 
            from: fromDate, 
            to: toDate, 
            type: period.periodType,
            name: period.periodName 
        });

        // 获取销售发票（含 GST）
        const salesResponse = await axios.get(`${XERO_API_BASE}/Invoices`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            },
            params: {
                where: `Date >= DateTime(${fromDate}) && Date <= DateTime(${toDate}) && Type == "ACCREC"`,
                page: 1
            }
        });

        // 获取采购账单（含 GST 抵扣）
        const billsResponse = await axios.get(`${XERO_API_BASE}/Invoices`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            },
            params: {
                where: `Date >= DateTime(${fromDate}) && Date <= DateTime(${toDate}) && Type == "ACCPAY"`,
                page: 1
            }
        });

        const salesInvoices = salesResponse.data.Invoices || [];
        const purchaseBills = billsResponse.data.Invoices || [];

        // 计算 GST - 区分应税和免税
        let totalSales = 0;
        let taxableSales = 0;      // 应税销售额
        let gstFreeSales = 0;      // 免税销售额
        let totalGSTCollected = 0;
        let gstSalesCount = 0;
        let gstFreeSalesCount = 0;

        salesInvoices.forEach(inv => {
            if (inv.Status === 'AUTHORISED' || inv.Status === 'PAID') {
                const subTotal = inv.SubTotal || 0;
                const totalTax = inv.TotalTax || 0;
                totalSales += subTotal;
                
                if (totalTax > 0) {
                    // 应税销售
                    taxableSales += subTotal;
                    totalGSTCollected += totalTax;
                    gstSalesCount++;
                } else {
                    // 免税销售 (GST-free)
                    gstFreeSales += subTotal;
                    gstFreeSalesCount++;
                }
            }
        });

        let totalPurchases = 0;
        let taxablePurchases = 0;  // 应税采购
        let gstFreePurchases = 0;  // 免税采购
        let totalGSTCredits = 0;
        let gstPurchaseCount = 0;
        let gstFreePurchaseCount = 0;

        purchaseBills.forEach(inv => {
            if (inv.Status === 'AUTHORISED' || inv.Status === 'PAID') {
                const subTotal = inv.SubTotal || 0;
                const totalTax = inv.TotalTax || 0;
                totalPurchases += subTotal;
                
                if (totalTax > 0) {
                    // 应税采购（可抵扣）
                    taxablePurchases += subTotal;
                    totalGSTCredits += totalTax;
                    gstPurchaseCount++;
                } else {
                    // 免税采购
                    gstFreePurchases += subTotal;
                    gstFreePurchaseCount++;
                }
            }
        });

        const netGST = totalGSTCollected - totalGSTCredits;

        // ✅ 使用新的截止日期计算（基于完整周期）
        const deadline = period.deadline;

        // 构建中文解读报告
        const report = {
            region: isAustralia ? 'Australia' : (isNewZealand ? 'New Zealand' : 'Unknown'),
            country_code: country,
            currency: organisation?.BaseCurrency || (isAustralia ? 'AUD' : 'NZD'),
            gst_rate: isAustralia ? '10%' : (isNewZealand ? '15%' : 'Unknown'),
            period: {
                start_date: fromDate,
                end_date: toDate,
                type: period.periodType,  // monthly 或 quarterly
                name: period.periodName,   // 例如 "Q1 (Jan-Mar) 2026"
                quarter: period.quarter,
                year: period.year,
                due_date: deadline.dueDate,
                days_until_due: deadline.daysRemaining,
                is_urgent: deadline.isUrgent,
                is_overdue: deadline.isOverdue
            },
            sales: {
                total_amount: totalSales.toFixed(2),
                taxable_amount: taxableSales.toFixed(2),
                gst_free_amount: gstFreeSales.toFixed(2),
                gst_collected: totalGSTCollected.toFixed(2),
                invoice_count: gstSalesCount + gstFreeSalesCount,
                taxable_invoice_count: gstSalesCount,
                gst_free_invoice_count: gstFreeSalesCount
            },
            purchases: {
                total_amount: totalPurchases.toFixed(2),
                taxable_amount: taxablePurchases.toFixed(2),
                gst_free_amount: gstFreePurchases.toFixed(2),
                gst_credits: totalGSTCredits.toFixed(2),
                bill_count: gstPurchaseCount + gstFreePurchaseCount,
                taxable_bill_count: gstPurchaseCount,
                gst_free_bill_count: gstFreePurchaseCount
            },
            gst_summary: {
                gst_collected: totalGSTCollected.toFixed(2),
                gst_credits: totalGSTCredits.toFixed(2),
                net_gst_payable: netGST.toFixed(2),
                is_refund: netGST < 0,
                taxable_sales: taxableSales.toFixed(2),
                gst_free_sales: gstFreeSales.toFixed(2)
            },
            // 中文解读
            interpretation: {
                title: isAustralia ? 'BAS 税务报告' : 'GST Return 报告',
                period_description: getPeriodDescription(period),
                summary: `${period.periodName} 应缴${isAustralia ? 'BAS' : 'GST'} $${Math.abs(netGST).toFixed(2)}`,
                explanation: netGST > 0 
                    ? `您需要向${isAustralia ? 'ATO' : 'IRD'}缴纳 $${netGST.toFixed(2)} 的税款`
                    : `您可以向${isAustralia ? 'ATO' : 'IRD'}申请退还 $${Math.abs(netGST).toFixed(2)}`,
                deadline_notice: deadline.isOverdue 
                    ? `⚠️ 已逾期 ${Math.abs(deadline.daysRemaining)} 天，请尽快申报！`
                    : deadline.isUrgent 
                        ? `⏰ 距离申报截止仅剩 ${deadline.daysRemaining} 天！`
                        : `📅 申报截止日：${deadline.dueDate}（还有 ${deadline.daysRemaining} 天）`,
                advice: generateGSTAdvice(totalSales, totalPurchases, netGST, isAustralia)
            }
        };

        return report;

    } catch (error) {
        logger.error('Failed to get BAS/GST report', error);
        throw handleXeroError(error);
    }
}

/**
 * 生成 GST 优化建议
 */
function generateGSTAdvice(sales, purchases, netGST, isAustralia) {
    const advice = [];
    
    if (netGST > 1000) {
        advice.push('💡 本期应缴税款较高，建议检查是否有遗漏的进项税抵扣发票');
    }
    
    if (purchases < sales * 0.3) {
        advice.push('💡 您的采购支出相对较低，如有计划采购设备或存货，可考虑在本期完成以抵扣GST');
    }
    
    if (isAustralia) {
        advice.push('📅 澳洲 BAS 通常每季度28日前申报，建议提前准备');
    } else {
        advice.push('📅 新西兰 GST 申报周期根据注册类型不同，请确认您的具体截止日期');
    }
    
    return advice;
}

/**
 * 现金流预测
 * 基于应收账款和应付账款预测未来现金流
 */
async function getCashflowForecast(days = 30) {
    const accessToken = await getValidToken();
    if (!accessToken) {
        throw new Error('Not authenticated');
    }

    const tenantId = await getTenantId(accessToken);
    if (!tenantId) {
        throw new Error('No tenant found');
    }

    try {
        // 获取应收账款（未付发票）
        const receivablesResponse = await axios.get(`${XERO_API_BASE}/Invoices`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            },
            params: {
                where: `Type == "ACCREC" && Status != "PAID" && Status != "VOIDED"`,
                page: 1
            }
        });

        // 获取应付账款（未付账单）
        const payablesResponse = await axios.get(`${XERO_API_BASE}/Invoices`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            },
            params: {
                where: `Type == "ACCPAY" && Status != "PAID" && Status != "VOIDED"`,
                page: 1
            }
        });

        // 获取银行余额
        const accountsResponse = await axios.get(`${XERO_API_BASE}/Accounts`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/json'
            },
            params: {
                where: `Type == "BANK" && Status == "ACTIVE"`
            }
        });

        const receivables = receivablesResponse.data.Invoices || [];
        const payables = payablesResponse.data.Invoices || [];
        const bankAccounts = accountsResponse.data.Accounts || [];

        const now = new Date();
        const forecastEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

        // 分析应收账款
        let totalReceivables = 0;
        let upcomingReceivables = 0;
        const receivablesByDate = {};

        receivables.forEach(inv => {
            const amount = inv.AmountDue || 0;
            totalReceivables += amount;
            
            const dueDate = inv.DueDate ? new Date(inv.DueDate) : null;
            if (dueDate && dueDate <= forecastEnd) {
                upcomingReceivables += amount;
                const dateKey = dueDate.toISOString().split('T')[0];
                receivablesByDate[dateKey] = (receivablesByDate[dateKey] || 0) + amount;
            }
        });

        // 分析应付账款
        let totalPayables = 0;
        let upcomingPayables = 0;
        const payablesByDate = {};

        payables.forEach(inv => {
            const amount = inv.AmountDue || 0;
            totalPayables += amount;
            
            const dueDate = inv.DueDate ? new Date(inv.DueDate) : null;
            if (dueDate && dueDate <= forecastEnd) {
                upcomingPayables += amount;
                const dateKey = dueDate.toISOString().split('T')[0];
                payablesByDate[dateKey] = (payablesByDate[dateKey] || 0) + amount;
            }
        });

        // 计算银行余额
        let totalBankBalance = 0;
        const bankBalances = bankAccounts.map(acc => ({
            name: acc.Name,
            balance: acc.Balance || 0
        }));
        bankBalances.forEach(acc => {
            totalBankBalance += acc.balance;
        });

        // 生成每日现金流预测
        const dailyForecast = [];
        let runningBalance = totalBankBalance;

        for (let i = 0; i <= days; i++) {
            const date = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
            const dateKey = date.toISOString().split('T')[0];
            
            const inflow = receivablesByDate[dateKey] || 0;
            const outflow = payablesByDate[dateKey] || 0;
            runningBalance += inflow - outflow;

            if (i % 7 === 0 || inflow > 0 || outflow > 0) { // 每周或有大额收支时记录
                dailyForecast.push({
                    date: dateKey,
                    day_of_week: date.toLocaleDateString('zh-CN', { weekday: 'short' }),
                    expected_inflow: inflow.toFixed(2),
                    expected_outflow: outflow.toFixed(2),
                    projected_balance: runningBalance.toFixed(2)
                });
            }
        }

        // 识别风险点
        const risks = [];
        const minBalance = Math.min(...dailyForecast.map(d => parseFloat(d.projected_balance)));
        
        if (minBalance < 0) {
            risks.push(`⚠️ 预测期内可能出现负现金流，最低余额 $${minBalance.toFixed(2)}`);
        }
        if (minBalance < 5000 && minBalance >= 0) {
            risks.push(`⚠️ 现金流偏紧，建议关注应收账款回收`);
        }
        if (totalPayables > totalReceivables + totalBankBalance) {
            risks.push(`⚠️ 应付账款总额超过可用资金，可能需要安排付款计划`);
        }

        // 生成建议
        const advice = [];
        if (upcomingReceivables > 0) {
            advice.push(`💡 未来${days}天有 $${upcomingReceivables.toFixed(2)} 应收账款到期，建议提前跟进`);
        }
        if (upcomingPayables > 0) {
            advice.push(`💡 未来${days}天有 $${upcomingPayables.toFixed(2)} 应付账款到期，请确保账户余额充足`);
        }
        if (totalReceivables > totalBankBalance * 2) {
            advice.push(`💡 应收账款较高，建议加强催收或考虑保理融资`);
        }

        return {
            forecast_period: {
                days: days,
                from: now.toISOString().split('T')[0],
                to: forecastEnd.toISOString().split('T')[0]
            },
            current_position: {
                bank_balance: totalBankBalance.toFixed(2),
                bank_accounts: bankBalances,
                total_receivables: totalReceivables.toFixed(2),
                total_payables: totalPayables.toFixed(2),
                net_position: (totalBankBalance + totalReceivables - totalPayables).toFixed(2)
            },
            upcoming_summary: {
                expected_inflow: upcomingReceivables.toFixed(2),
                expected_outflow: upcomingPayables.toFixed(2),
                net_flow: (upcomingReceivables - upcomingPayables).toFixed(2)
            },
            daily_forecast: dailyForecast,
            risks: risks,
            advice: advice,
            // 中文解读
            interpretation: {
                summary: `当前银行余额 $${totalBankBalance.toFixed(2)}，未来${days}天预计${upcomingReceivables > upcomingPayables ? '净流入' : '净流出'} $${Math.abs(upcomingReceivables - upcomingPayables).toFixed(2)}`,
                health_status: minBalance > 10000 ? '健康' : (minBalance > 0 ? '需关注' : '紧张'),
                key_insight: generateCashflowInsight(totalBankBalance, totalReceivables, totalPayables, upcomingReceivables, upcomingPayables)
            }
        };

    } catch (error) {
        console.error('现金流预测失败:', error.message);
        if (error.response) {
            console.error('API 错误:', error.response.data);
        }
        throw error;
    }
}

/**
 * 生成现金流洞察
 */
function generateCashflowInsight(balance, receivables, payables, upcomingIn, upcomingOut) {
    const insights = [];
    
    const runway = payables > 0 ? balance / (payables / 30) : 999; // 按当前支出能撑多少天
    
    if (runway < 30) {
        insights.push('现金流紧张，建议加快收款或控制支出');
    } else if (runway < 60) {
        insights.push('现金流尚可，但建议保持关注');
    } else {
        insights.push('现金流健康');
    }
    
    if (receivables > payables * 1.5) {
        insights.push('应收账款偏高，存在坏账风险');
    }
    
    if (upcomingOut > upcomingIn && upcomingOut > balance * 0.5) {
        insights.push('近期有大额支出，请提前准备资金');
    }
    
    return insights.join('；');
}

/**
 * 初始化 Xero 模块
 */
function initXero() {
    ensureDataDir();
    console.log('Xero 模块已初始化');
}

/**
 * 获取发票 PDF
 * @param {string} invoiceId - 发票 ID
 * @returns {Promise<Buffer>} PDF 文件内容
 */
async function getInvoicePDF(invoiceId) {
    logger.info('Getting invoice PDF', { invoiceId });
    
    const accessToken = await getValidToken();
    if (!accessToken) {
        logger.warn('Cannot get invoice PDF: not authenticated');
        throw new Error('XERO_NOT_AUTHENTICATED');
    }

    const tenantId = await getTenantId(accessToken);
    if (!tenantId) {
        logger.warn('Cannot get invoice PDF: no tenant found');
        throw new Error('XERO_NO_TENANT');
    }

    try {
        const response = await axios.get(`${XERO_API_BASE}/Invoices/${invoiceId}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Xero-tenant-id': tenantId,
                'Accept': 'application/pdf'
            },
            responseType: 'arraybuffer', // 获取二进制数据
            timeout: 30000
        });

        if (response.status === 200) {
            logger.info('Invoice PDF retrieved successfully', { 
                invoiceId, 
                size: response.data.length 
            });
            return {
                pdfBuffer: response.data,
                contentType: 'application/pdf',
                filename: `Invoice_${invoiceId}.pdf`
            };
        }
    } catch (error) {
        logger.error('Failed to get invoice PDF', error);
        throw handleXeroError(error);
    }
}

/**
 * 通过发票编号获取发票 PDF
 * @param {string} invoiceNumber - 发票编号（如 INV-0001）
 * @returns {Promise<Object>} PDF 文件内容
 */
async function getInvoicePDFByNumber(invoiceNumber) {
    logger.info('Getting invoice PDF by number', { invoiceNumber });
    
    // 先查询发票获取 ID
    const invoices = await getAllInvoices();
    const invoice = invoices.find(inv => inv.InvoiceNumber === invoiceNumber);
    
    if (!invoice) {
        throw new Error(`INVOICE_NOT_FOUND: 找不到发票 ${invoiceNumber}`);
    }
    
    return await getInvoicePDF(invoice.InvoiceID);
}

module.exports = {
    initXero,
    getValidToken,
    getTenantId,
    getAuthUrl,
    handleCallback,
    getReceivablesSummary,
    createInvoice,
    getAllInvoices,
    getAllCustomers,
    getCustomerInvoices,
    healthCheck,
    getBASReport,
    getCashflowForecast,
    checkTokenStatus,
    getInvoicePDF,
    getInvoicePDFByNumber
};
