/**
 * 简单缓存工具 - 用于缓存 token 等临时数据
 */

const logger = require('./logger');

class Cache {
    constructor(defaultTTL = 60000) { // 默认 60 秒
        this.store = new Map();
        this.defaultTTL = defaultTTL;
    }
    
    /**
     * 设置缓存
     * @param {string} key - 缓存键
     * @param {*} value - 缓存值
     * @param {number} ttl - 过期时间（毫秒）
     */
    set(key, value, ttl = this.defaultTTL) {
        const expiresAt = Date.now() + ttl;
        this.store.set(key, { value, expiresAt });
        logger.debug('缓存设置', { key, ttl });
    }
    
    /**
     * 获取缓存
     * @param {string} key - 缓存键
     * @returns {*} 缓存值或 null
     */
    get(key) {
        const item = this.store.get(key);
        
        if (!item) {
            return null;
        }
        
        // 检查是否过期
        if (Date.now() > item.expiresAt) {
            this.store.delete(key);
            logger.debug('缓存过期', { key });
            return null;
        }
        
        logger.debug('缓存命中', { key });
        return item.value;
    }
    
    /**
     * 删除缓存
     * @param {string} key - 缓存键
     */
    delete(key) {
        this.store.delete(key);
        logger.debug('缓存删除', { key });
    }
    
    /**
     * 清空所有缓存
     */
    clear() {
        this.store.clear();
        logger.info('缓存已清空');
    }
    
    /**
     * 获取缓存统计
     */
    getStats() {
        const now = Date.now();
        let valid = 0;
        let expired = 0;
        
        for (const [key, item] of this.store) {
            if (now > item.expiresAt) {
                expired++;
            } else {
                valid++;
            }
        }
        
        return { total: this.store.size, valid, expired };
    }
    
    /**
     * 清理过期缓存
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, item] of this.store) {
            if (now > item.expiresAt) {
                this.store.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0) {
            logger.debug('缓存清理完成', { cleaned });
        }
        
        return cleaned;
    }
}

// 创建全局缓存实例
const tokenCache = new Cache(5400000); // 飞书 token 缓存 90 分钟（默认2小时过期）
const xeroCache = new Cache(300000);   // Xero 数据缓存 5 分钟

module.exports = {
    Cache,
    tokenCache,
    xeroCache
};
