/**
 * 日志工具 - 统一日志格式和级别
 */

const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

const CURRENT_LEVEL = process.env.LOG_LEVEL || 'INFO';

function shouldLog(level) {
    return LOG_LEVELS[level] >= LOG_LEVELS[CURRENT_LEVEL];
}

function formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
    return `[${timestamp}] [${level}] ${message} ${metaStr}`;
}

const logger = {
    debug: (message, meta) => {
        if (shouldLog('DEBUG')) {
            console.log(formatMessage('DEBUG', message, meta));
        }
    },
    
    info: (message, meta) => {
        if (shouldLog('INFO')) {
            console.log(formatMessage('INFO', message, meta));
        }
    },
    
    warn: (message, meta) => {
        if (shouldLog('WARN')) {
            console.warn(formatMessage('WARN', message, meta));
        }
    },
    
    error: (message, error, meta = {}) => {
        if (shouldLog('ERROR')) {
            const errorMeta = {
                ...meta,
                errorMessage: error?.message,
                errorStack: error?.stack?.split('\n')[0]
            };
            console.error(formatMessage('ERROR', message, errorMeta));
        }
    }
};

module.exports = logger;
