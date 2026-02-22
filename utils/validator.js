/**
 * 输入验证工具
 */

const { AppError } = require('./error-handler');

/**
 * 验证客户名称
 */
function validateCustomerName(name) {
    if (!name || typeof name !== 'string') {
        throw new AppError('客户名称不能为空', 400, 'INVALID_CUSTOMER_NAME');
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length === 0) {
        throw new AppError('客户名称不能为空', 400, 'INVALID_CUSTOMER_NAME');
    }
    
    if (trimmed.length > 200) {
        throw new AppError('客户名称过长（最大200字符）', 400, 'INVALID_CUSTOMER_NAME');
    }
    
    // 检查非法字符
    const invalidChars = /[<>\"'&]/;
    if (invalidChars.test(trimmed)) {
        throw new AppError('客户名称包含非法字符', 400, 'INVALID_CUSTOMER_NAME');
    }
    
    return trimmed;
}

/**
 * 验证金额
 */
function validateAmount(amount) {
    const num = Number(amount);
    
    if (isNaN(num)) {
        throw new AppError('金额必须是数字', 400, 'INVALID_AMOUNT');
    }
    
    if (num <= 0) {
        throw new AppError('金额必须大于0', 400, 'INVALID_AMOUNT');
    }
    
    if (num > 100000000) {
        throw new AppError('金额过大（最大1亿）', 400, 'INVALID_AMOUNT');
    }
    
    // 保留2位小数
    return Math.round(num * 100) / 100;
}

/**
 * 验证描述
 */
function validateDescription(description) {
    if (!description || typeof description !== 'string') {
        return 'Service';
    }
    
    const trimmed = description.trim();
    
    if (trimmed.length === 0) {
        return 'Service';
    }
    
    if (trimmed.length > 1000) {
        throw new AppError('描述过长（最大1000字符）', 400, 'INVALID_DESCRIPTION');
    }
    
    // 简单的 XSS 防护
    return trimmed
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
}

/**
 * 验证天数（用于现金流预测）
 */
function validateDays(days) {
    const num = Number(days);
    
    if (isNaN(num)) {
        return 30; // 默认值
    }
    
    if (num < 1) {
        return 1;
    }
    
    if (num > 365) {
        return 365;
    }
    
    return Math.floor(num);
}

/**
 * 验证飞书消息内容
 */
function validateFeishuMessage(content) {
    if (!content || typeof content !== 'object') {
        throw new AppError('消息内容格式错误', 400, 'INVALID_MESSAGE');
    }
    
    const text = content.text || '';
    
    if (text.length > 10000) {
        throw new AppError('消息内容过长', 400, 'MESSAGE_TOO_LONG');
    }
    
    return text;
}

/**
 * 清理用户输入（防止 XSS）
 */
function sanitizeInput(input) {
    if (typeof input !== 'string') {
        return input;
    }
    
    return input
        .trim()
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/&/g, '&amp;');
}

module.exports = {
    validateCustomerName,
    validateAmount,
    validateDescription,
    validateDays,
    validateFeishuMessage,
    sanitizeInput
};
