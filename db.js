/**
 * SQLite 数据库模块
 * 用于持久化存储对话历史、用户配置等
 */

const Database = require('better-sqlite3');
const path = require('path');
const logger = require('./utils/logger');

// 数据库文件路径
const DB_PATH = process.env.RENDER_DISK_PATH 
    ? path.join(process.env.RENDER_DISK_PATH, 'bizmate.db')
    : path.join(__dirname, 'data', 'bizmate.db');

let db = null;

/**
 * 初始化数据库
 */
function initDatabase() {
    try {
        // 确保数据目录存在
        const fs = require('fs');
        const dbDir = path.dirname(DB_PATH);
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        // 创建数据库连接
        db = new Database(DB_PATH);
        
        // 启用 WAL 模式（更好的并发性能）
        db.pragma('journal_mode = WAL');
        
        // 创建表
        createTables();
        
        logger.info('Database initialized', { path: DB_PATH });
        return true;
    } catch (error) {
        logger.error('Failed to initialize database', error);
        return false;
    }
}

/**
 * 创建数据表
 */
function createTables() {
    // 对话历史表
    db.exec(`
        CREATE TABLE IF NOT EXISTS conversation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_conversation_user_time 
        ON conversation_history(user_id, timestamp)
    `);

    // 用户配置表
    db.exec(`
        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id TEXT PRIMARY KEY,
            preferences TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // OCR 待确认发票表（带过期时间）
    db.exec(`
        CREATE TABLE IF NOT EXISTS pending_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            invoice_data TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建过期时间索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pending_expires 
        ON pending_invoices(expires_at)
    `);

    // 用户表（多用户支持）
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT UNIQUE NOT NULL,
            platform TEXT NOT NULL,
            platform_user_id TEXT NOT NULL,
            name TEXT,
            email TEXT,
            is_admin BOOLEAN DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建用户索引
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_platform 
        ON users(platform, platform_user_id)
    `);

    // Xero Token 表（每个用户独立的 Xero 授权）
    db.exec(`
        CREATE TABLE IF NOT EXISTS xero_tokens (
            user_id TEXT PRIMARY KEY,
            access_token TEXT NOT NULL,
            refresh_token TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            tenant_id TEXT,
            tenant_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id)
        )
    `);

    logger.info('Database tables created');
}

/**
 * 保存对话历史
 * @param {string} userId - 用户ID
 * @param {string} role - 角色 (user/assistant)
 * @param {string} content - 内容
 */
function saveMessage(userId, role, content) {
    try {
        const stmt = db.prepare(`
            INSERT INTO conversation_history (user_id, role, content, timestamp)
            VALUES (?, ?, ?, ?)
        `);
        stmt.run(userId, role, content, Date.now());
        
        // 清理旧消息（保留最近 50 条）
        cleanupOldMessages(userId, 50);
        
        return true;
    } catch (error) {
        logger.error('Failed to save message', { userId, error: error.message });
        return false;
    }
}

/**
 * 获取对话历史
 * @param {string} userId - 用户ID
 * @param {number} limit - 返回消息数量限制
 * @returns {Array} 消息数组
 */
function getHistory(userId, limit = 20) {
    try {
        const stmt = db.prepare(`
            SELECT role, content, timestamp
            FROM conversation_history
            WHERE user_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        `);
        const rows = stmt.all(userId, limit);
        
        // 转换为 OpenAI 格式并反转顺序（从早到晚）
        return rows.reverse().map(row => ({
            role: row.role,
            content: row.content
        }));
    } catch (error) {
        logger.error('Failed to get history', { userId, error: error.message });
        return [];
    }
}

/**
 * 清理旧消息
 * @param {string} userId - 用户ID
 * @param {number} keepCount - 保留的消息数量
 */
function cleanupOldMessages(userId, keepCount) {
    try {
        const stmt = db.prepare(`
            DELETE FROM conversation_history
            WHERE user_id = ?
            AND id NOT IN (
                SELECT id FROM conversation_history
                WHERE user_id = ?
                ORDER BY timestamp DESC
                LIMIT ?
            )
        `);
        stmt.run(userId, userId, keepCount);
    } catch (error) {
        logger.error('Failed to cleanup old messages', { userId, error: error.message });
    }
}

/**
 * 清除用户对话历史
 * @param {string} userId - 用户ID
 */
function clearHistory(userId) {
    try {
        const stmt = db.prepare(`
            DELETE FROM conversation_history WHERE user_id = ?
        `);
        stmt.run(userId);
        logger.info('History cleared', { userId });
        return true;
    } catch (error) {
        logger.error('Failed to clear history', { userId, error: error.message });
        return false;
    }
}

/**
 * 存储待确认发票
 * @param {string} userId - 用户ID
 * @param {object} invoiceData - 发票数据
 * @param {number} ttlMinutes - 过期时间（分钟）
 */
function storePendingInvoice(userId, invoiceData, ttlMinutes = 30) {
    try {
        // 先清除该用户的旧待确认发票
        clearPendingInvoice(userId);
        
        const expiresAt = Date.now() + (ttlMinutes * 60 * 1000);
        const stmt = db.prepare(`
            INSERT INTO pending_invoices (user_id, invoice_data, expires_at)
            VALUES (?, ?, ?)
        `);
        stmt.run(userId, JSON.stringify(invoiceData), expiresAt);
        
        return true;
    } catch (error) {
        logger.error('Failed to store pending invoice', { userId, error: error.message });
        return false;
    }
}

/**
 * 获取待确认发票
 * @param {string} userId - 用户ID
 * @returns {object|null} 发票数据或 null
 */
function getPendingInvoice(userId) {
    try {
        // 清理过期记录
        cleanupExpiredInvoices();
        
        const stmt = db.prepare(`
            SELECT invoice_data, expires_at
            FROM pending_invoices
            WHERE user_id = ? AND expires_at > ?
        `);
        const row = stmt.get(userId, Date.now());
        
        if (row) {
            return JSON.parse(row.invoice_data);
        }
        return null;
    } catch (error) {
        logger.error('Failed to get pending invoice', { userId, error: error.message });
        return null;
    }
}

/**
 * 清除待确认发票
 * @param {string} userId - 用户ID
 */
function clearPendingInvoice(userId) {
    try {
        const stmt = db.prepare(`
            DELETE FROM pending_invoices WHERE user_id = ?
        `);
        stmt.run(userId);
        return true;
    } catch (error) {
        logger.error('Failed to clear pending invoice', { userId, error: error.message });
        return false;
    }
}

/**
 * 清理过期发票记录
 */
function cleanupExpiredInvoices() {
    try {
        const stmt = db.prepare(`
            DELETE FROM pending_invoices WHERE expires_at < ?
        `);
        const result = stmt.run(Date.now());
        
        if (result.changes > 0) {
            logger.info('Cleaned up expired invoices', { count: result.changes });
        }
    } catch (error) {
        logger.error('Failed to cleanup expired invoices', error);
    }
}

/**
 * 获取数据库统计信息
 */
function getStats() {
    try {
        const historyCount = db.prepare('SELECT COUNT(*) as count FROM conversation_history').get();
        const userCount = db.prepare('SELECT COUNT(DISTINCT user_id) as count FROM conversation_history').get();
        const pendingCount = db.prepare('SELECT COUNT(*) as count FROM pending_invoices').get();
        
        return {
            totalMessages: historyCount.count,
            uniqueUsers: userCount.count,
            pendingInvoices: pendingCount.count
        };
    } catch (error) {
        logger.error('Failed to get stats', error);
        return null;
    }
}

/**
 * 关闭数据库连接
 */
function closeDatabase() {
    if (db) {
        db.close();
        logger.info('Database closed');
    }
}

// 初始化数据库
initDatabase();

// 定期清理过期发票（每 10 分钟）
setInterval(cleanupExpiredInvoices, 10 * 60 * 1000);

// ==================== 用户管理函数 ====================

/**
 * 创建或更新用户
 * @param {string} platform - 平台类型 (feishu/wechat)
 * @param {string} platformUserId - 平台用户ID
 * @param {object} userInfo - 用户信息
 * @returns {string} 内部用户ID
 */
function createOrUpdateUser(platform, platformUserId, userInfo = {}) {
    try {
        // 生成内部用户ID
        const userId = `${platform}:${platformUserId}`;
        
        const stmt = db.prepare(`
            INSERT INTO users (user_id, platform, platform_user_id, name, email)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                name = COALESCE(excluded.name, name),
                email = COALESCE(excluded.email, email),
                updated_at = CURRENT_TIMESTAMP
        `);
        
        stmt.run(
            userId,
            platform,
            platformUserId,
            userInfo.name || null,
            userInfo.email || null
        );
        
        logger.info('User created/updated', { userId, platform });
        return userId;
    } catch (error) {
        logger.error('Failed to create/update user', { platform, platformUserId, error: error.message });
        return null;
    }
}

/**
 * 获取用户信息
 * @param {string} userId - 内部用户ID
 * @returns {object|null} 用户信息
 */
function getUser(userId) {
    try {
        const stmt = db.prepare('SELECT * FROM users WHERE user_id = ?');
        return stmt.get(userId);
    } catch (error) {
        logger.error('Failed to get user', { userId, error: error.message });
        return null;
    }
}

/**
 * 通过平台用户ID获取用户
 * @param {string} platform - 平台类型
 * @param {string} platformUserId - 平台用户ID
 * @returns {object|null} 用户信息
 */
function getUserByPlatform(platform, platformUserId) {
    try {
        const stmt = db.prepare('SELECT * FROM users WHERE platform = ? AND platform_user_id = ?');
        return stmt.get(platform, platformUserId);
    } catch (error) {
        logger.error('Failed to get user by platform', { platform, platformUserId, error: error.message });
        return null;
    }
}

/**
 * 获取所有用户列表
 * @returns {Array} 用户列表
 */
function getAllUsers() {
    try {
        const stmt = db.prepare('SELECT * FROM users ORDER BY created_at DESC');
        return stmt.all();
    } catch (error) {
        logger.error('Failed to get all users', error);
        return [];
    }
}

// ==================== Xero Token 管理函数 ====================

/**
 * 保存 Xero Token
 * @param {string} userId - 内部用户ID
 * @param {object} tokens - Token 信息
 */
function saveXeroToken(userId, tokens) {
    try {
        const stmt = db.prepare(`
            INSERT INTO xero_tokens (user_id, access_token, refresh_token, expires_at, tenant_id, tenant_name)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at,
                tenant_id = COALESCE(excluded.tenant_id, tenant_id),
                tenant_name = COALESCE(excluded.tenant_name, tenant_name),
                updated_at = CURRENT_TIMESTAMP
        `);
        
        stmt.run(
            userId,
            tokens.access_token,
            tokens.refresh_token,
            tokens.expires_at,
            tokens.tenant_id || null,
            tokens.tenant_name || null
        );
        
        logger.info('Xero token saved', { userId });
        return true;
    } catch (error) {
        logger.error('Failed to save Xero token', { userId, error: error.message });
        return false;
    }
}

/**
 * 获取 Xero Token
 * @param {string} userId - 内部用户ID
 * @returns {object|null} Token 信息
 */
function getXeroToken(userId) {
    try {
        const stmt = db.prepare('SELECT * FROM xero_tokens WHERE user_id = ?');
        return stmt.get(userId);
    } catch (error) {
        logger.error('Failed to get Xero token', { userId, error: error.message });
        return null;
    }
}

/**
 * 删除 Xero Token（断开连接）
 * @param {string} userId - 内部用户ID
 */
function deleteXeroToken(userId) {
    try {
        const stmt = db.prepare('DELETE FROM xero_tokens WHERE user_id = ?');
        stmt.run(userId);
        logger.info('Xero token deleted', { userId });
        return true;
    } catch (error) {
        logger.error('Failed to delete Xero token', { userId, error: error.message });
        return false;
    }
}

/**
 * 获取所有已连接 Xero 的用户
 * @returns {Array} 用户列表
 */
function getAllXeroUsers() {
    try {
        const stmt = db.prepare(`
            SELECT u.*, x.tenant_name, x.updated_at as xero_updated_at
            FROM users u
            JOIN xero_tokens x ON u.user_id = x.user_id
            ORDER BY x.updated_at DESC
        `);
        return stmt.all();
    } catch (error) {
        logger.error('Failed to get all Xero users', error);
        return [];
    }
}

module.exports = {
    initDatabase,
    saveMessage,
    getHistory,
    clearHistory,
    storePendingInvoice,
    getPendingInvoice,
    clearPendingInvoice,
    getStats,
    closeDatabase,
    // 用户管理
    createOrUpdateUser,
    getUser,
    getUserByPlatform,
    getAllUsers,
    // Xero Token 管理
    saveXeroToken,
    getXeroToken,
    deleteXeroToken,
    getAllXeroUsers
};
