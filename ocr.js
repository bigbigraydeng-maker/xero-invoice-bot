/**
 * OCR 发票识别模块
 * 支持：百度OCR、腾讯OCR、阿里OCR
 * 默认使用百度OCR（免费额度高，识别效果好）
 * 
 * 注意：待确认发票存储已迁移到 db.js（SQLite 持久化）
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const db = require('./db');

// OCR 配置
const OCR_CONFIG = {
    // 百度OCR配置
    baidu: {
        apiKey: process.env.BAIDU_OCR_API_KEY,
        secretKey: process.env.BAIDU_OCR_SECRET_KEY,
        accessToken: null,
        tokenExpiry: 0
    }
};

// 注意：pendingInvoices 已迁移到 SQLite，通过 db.js 访问

/**
 * 获取百度OCR access token
 */
async function getBaiduAccessToken() {
    const config = OCR_CONFIG.baidu;
    
    // 如果token还有效，直接返回
    if (config.accessToken && Date.now() < config.tokenExpiry) {
        return config.accessToken;
    }
    
    if (!config.apiKey || !config.secretKey) {
        throw new Error('百度OCR未配置，请设置 BAIDU_OCR_API_KEY 和 BAIDU_OCR_SECRET_KEY');
    }
    
    try {
        const response = await axios.post(
            `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${config.apiKey}&client_secret=${config.secretKey}`
        );
        
        if (response.data.access_token) {
            config.accessToken = response.data.access_token;
            // token有效期30天，这里设置29天后过期
            config.tokenExpiry = Date.now() + (29 * 24 * 60 * 60 * 1000);
            console.log('百度OCR token获取成功');
            return config.accessToken;
        }
    } catch (error) {
        console.error('获取百度OCR token失败:', error.message);
        throw error;
    }
}

/**
 * 识别发票图片
 * @param {string} imageBase64 - base64编码的图片
 * @returns {object} 识别结果
 */
async function recognizeInvoice(imageBase64) {
    try {
        console.log('开始识别发票...');
        const accessToken = await getBaiduAccessToken();
        
        // 使用百度OCR增值税发票识别接口
        const response = await axios.post(
            `https://aip.baidubce.com/rest/2.0/ocr/v1/vat_invoice?access_token=${accessToken}`,
            `image=${encodeURIComponent(imageBase64)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 30000
            }
        );
        
        if (response.data.words_result) {
            console.log('发票识别成功');
            return parseInvoiceResult(response.data.words_result);
        } else {
            throw new Error('发票识别失败: ' + (response.data.error_msg || '未知错误'));
        }
    } catch (error) {
        console.error('OCR识别失败:', error.message);
        throw error;
    }
}

/**
 * 解析发票识别结果
 */
function parseInvoiceResult(wordsResult) {
    const result = {
        invoiceType: wordsResult.InvoiceType?.word || '未知',
        invoiceCode: wordsResult.InvoiceCode?.word || '',
        invoiceNum: wordsResult.InvoiceNum?.word || '',
        invoiceDate: wordsResult.InvoiceDate?.word || '',
        totalAmount: parseAmount(wordsResult.TotalAmount?.word),
        totalTax: parseAmount(wordsResult.TotalTax?.word),
        amountInFigures: parseAmount(wordsResult.AmountInFigures?.word),
        sellerName: wordsResult.SellerName?.word || '',
        sellerRegisterNum: wordsResult.SellerRegisterNum?.word || '',
        purchaserName: wordsResult.PurchaserName?.word || '',
        commodityName: wordsResult.CommodityName?.map(item => item.word).join(', ') || '',
        raw: wordsResult
    };
    
    return result;
}

/**
 * 解析金额（处理中文数字和货币符号）
 */
function parseAmount(amountStr) {
    if (!amountStr) return 0;
    // 移除货币符号和逗号
    const cleaned = amountStr.replace(/[¥￥,$]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/**
 * 格式化发票信息为可读文本
 */
function formatInvoiceInfo(invoice) {
    return `📄 **发票识别结果**

🏢 **销售方**: ${invoice.sellerName}
👤 **购买方**: ${invoice.purchaserName}
📅 **开票日期**: ${invoice.invoiceDate}
🧾 **发票号码**: ${invoice.invoiceNum}
💰 **金额**: ¥${invoice.amountInFigures.toFixed(2)}
📦 **商品**: ${invoice.commodityName || '未识别'}

请确认以上信息是否正确？
回复 "确认" 直接创建发票
回复 "修改" 告诉我需要修改的内容`;
}

/**
 * 存储待确认的发票
 * 使用 SQLite 持久化存储（替代内存 Map）
 */
async function storePendingInvoice(userId, invoiceData) {
    return await db.storePendingInvoice(userId, invoiceData, 30);
}

/**
 * 获取待确认的发票
 * 从 SQLite 数据库读取
 */
async function getPendingInvoice(userId) {
    return await db.getPendingInvoice(userId);
}

/**
 * 清除待确认的发票
 * 从 SQLite 数据库删除
 */
async function clearPendingInvoice(userId) {
    return await db.clearPendingInvoice(userId);
}

/**
 * 将OCR结果转换为Xero发票格式
 */
function convertToXeroInvoice(ocrResult, customerName) {
    return {
        customerName: customerName || ocrResult.purchaserName || '未命名客户',
        amount: ocrResult.amountInFigures || ocrResult.totalAmount,
        description: `发票识别: ${ocrResult.commodityName || '商品服务'} (${ocrResult.invoiceNum})`,
        invoiceDate: ocrResult.invoiceDate,
        reference: ocrResult.invoiceNum
    };
}

module.exports = {
    recognizeInvoice,
    formatInvoiceInfo,
    storePendingInvoice,
    getPendingInvoice,
    clearPendingInvoice,
    convertToXeroInvoice
};
