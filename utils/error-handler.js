/**
 * 错误处理工具 - 统一错误处理和响应
 */

const logger = require('./logger');

/**
 * 自定义应用错误
 */
class AppError extends Error {
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.isOperational = true;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 异步错误包装器 - 自动捕获 async 函数中的错误
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * 全局错误处理中间件
 */
function globalErrorHandler(err, req, res, next) {
    err.statusCode = err.statusCode || 500;
    err.code = err.code || 'INTERNAL_ERROR';
    
    logger.error('请求处理错误', err, {
        path: req.path,
        method: req.method,
        statusCode: err.statusCode,
        code: err.code
    });
    
    // 生产环境不返回详细错误信息
    const isDev = process.env.NODE_ENV === 'development';
    
    res.status(err.statusCode).json({
        success: false,
        error: {
            code: err.code,
            message: err.isOperational ? err.message : '服务器内部错误',
            ...(isDev && { stack: err.stack })
        }
    });
}

/**
 * 处理 Xero API 错误
 */
function handleXeroError(error) {
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        switch (status) {
            case 401:
                logger.warn('Xero 认证失败', { status, detail: data?.Detail });
                return new AppError('Xero 未授权或 token 已过期，请重新授权', 401, 'XERO_UNAUTHORIZED');
            case 403:
                logger.warn('Xero 权限不足', { status });
                return new AppError('Xero 权限不足，请检查应用权限', 403, 'XERO_FORBIDDEN');
            case 404:
                return new AppError('请求的资源不存在', 404, 'XERO_NOT_FOUND');
            case 429:
                logger.warn('Xero API 限流');
                return new AppError('请求过于频繁，请稍后重试', 429, 'XERO_RATE_LIMIT');
            default:
                logger.error('Xero API 错误', error, { status });
                return new AppError('Xero 服务暂时不可用', 503, 'XERO_UNAVAILABLE');
        }
    }
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        return new AppError('请求超时，请稍后重试', 504, 'TIMEOUT');
    }
    
    logger.error('Xero 未知错误', error);
    return new AppError('处理请求时发生错误', 500, 'UNKNOWN_ERROR');
}

/**
 * 处理飞书 API 错误
 */
function handleFeishuError(error) {
    if (error.response) {
        const status = error.response.status;
        const data = error.response.data;
        
        logger.error('飞书 API 错误', error, { status, code: data?.code });
        
        if (status === 401 || status === 403) {
            return new AppError('飞书认证失败', 401, 'FEISHU_AUTH_FAILED');
        }
        
        return new AppError('飞书服务暂时不可用', 503, 'FEISHU_UNAVAILABLE');
    }
    
    return new AppError('发送消息失败', 500, 'FEISHU_ERROR');
}

module.exports = {
    AppError,
    asyncHandler,
    globalErrorHandler,
    handleXeroError,
    handleFeishuError
};
