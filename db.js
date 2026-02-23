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

module.exports = {
    initDatabase,
    saveMessage,
    getHistory,
    clearHistory,
    storePendingInvoice,
    getPendingInvoice,
    clearPendingInvoice,
    getStats,
    closeDatabase
};
