/**
 * 统一OCR模块 - 支持多服务商自动切换
 * 支持：百度OCR、Google Cloud Vision
 * 自动故障转移机制
 */

const axios = require('axios');

// OCR服务商配置
const OCR_PROVIDERS = {
    baidu: {
        name: '百度OCR',
        enabled: !!(process.env.BAIDU_OCR_API_KEY && process.env.BAIDU_OCR_SECRET_KEY),
        priority: 1, // 优先级，数字越小越优先
        timeout: 15000, // 15秒超时
        retryCount: 2
    },
    google: {
        name: 'Google Cloud Vision',
        enabled: !!process.env.GOOGLE_VISION_API_KEY,
        priority: 2,
        timeout: 10000, // 10秒超时（Google通常更快）
        retryCount: 2
    }
};

// 百度OCR Token管理
const baiduToken = {
    accessToken: null,
    expiry: 0
};

/**
 * 获取可用的OCR服务商列表（按优先级排序）
 */
function getAvailableProviders() {
    return Object.entries(OCR_PROVIDERS)
        .filter(([_, config]) => config.enabled)
        .sort((a, b) => a[1].priority - b[1].priority)
        .map(([name, _]) => name);
}

/**
 * 统一发票识别接口
 * @param {string} imageBase64 - base64编码的图片
 * @returns {object} 标准化的发票数据
 */
async function recognizeInvoice(imageBase64) {
    const providers = getAvailableProviders();
    
    if (providers.length === 0) {
        throw new Error('没有可用的OCR服务商，请检查环境变量配置');
    }
    
    const errors = [];
    
    for (const provider of providers) {
        try {
            console.log(`尝试使用 ${OCR_PROVIDERS[provider].name} 识别发票...`);
            const result = await recognizeWithProvider(provider, imageBase64);
            console.log(`${OCR_PROVIDERS[provider].name} 识别成功`);
            return result;
        } catch (error) {
            console.error(`${OCR_PROVIDERS[provider].name} 识别失败:`, error.message);
            errors.push({
                provider: OCR_PROVIDERS[provider].name,
                error: error.message
            });
            
            // 继续尝试下一个服务商
            continue;
        }
    }
    
    // 所有服务商都失败
    throw new Error(`所有OCR服务商均识别失败:\n${errors.map(e => `- ${e.provider}: ${e.error}`).join('\n')}`);
}

/**
 * 使用指定服务商识别
 */
async function recognizeWithProvider(provider, imageBase64) {
    switch (provider) {
        case 'baidu':
            return await recognizeWithBaidu(imageBase64);
        case 'google':
            return await recognizeWithGoogle(imageBase64);
        default:
            throw new Error(`未知的服务商: ${provider}`);
    }
}

/**
 * 百度OCR识别
 */
async function recognizeWithBaidu(imageBase64) {
    const config = OCR_PROVIDERS.baidu;
    
    // 获取access token
    const accessToken = await getBaiduAccessToken();
    
    try {
        const response = await axios.post(
            `https://aip.baidubce.com/rest/2.0/ocr/v1/vat_invoice?access_token=${accessToken}`,
            `image=${encodeURIComponent(imageBase64)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: config.timeout
            }
        );
        
        if (response.data.words_result) {
            return normalizeBaiduResult(response.data.words_result);
        } else {
            throw new Error(response.data.error_msg || '百度OCR返回空结果');
        }
    } catch (error) {
        if (error.response) {
            throw new Error(`百度OCR错误: ${error.response.data?.error_msg || error.response.status}`);
        }
        throw error;
    }
}

/**
 * 获取百度Access Token
 */
async function getBaiduAccessToken() {
    if (baiduToken.accessToken && Date.now() < baiduToken.expiry) {
        return baiduToken.accessToken;
    }
    
    const apiKey = process.env.BAIDU_OCR_API_KEY;
    const secretKey = process.env.BAIDU_OCR_SECRET_KEY;
    
    if (!apiKey || !secretKey) {
        throw new Error('百度OCR未配置');
    }
    
    try {
        const response = await axios.post(
            `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
            null,
            { timeout: 10000 }
        );
        
        if (response.data.access_token) {
            baiduToken.accessToken = response.data.access_token;
            baiduToken.expiry = Date.now() + (29 * 24 * 60 * 60 * 1000); // 29天
            return baiduToken.accessToken;
        }
        throw new Error('获取百度token失败');
    } catch (error) {
        throw new Error(`获取百度token失败: ${error.message}`);
    }
}

/**
 * Google Cloud Vision OCR识别
 */
async function recognizeWithGoogle(imageBase64) {
    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    
    if (!apiKey) {
        throw new Error('Google Vision未配置');
    }
    
    try {
        const response = await axios.post(
            `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
            {
                requests: [{
                    image: {
                        content: imageBase64
                    },
                    features: [
                        {
                            type: 'DOCUMENT_TEXT_DETECTION', // 文档文字识别（比TEXT_DETECTION更适合发票）
                            maxResults: 1
                        }
                    ]
                }]
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: OCR_PROVIDERS.google.timeout
            }
        );
        
        const result = response.data.responses?.[0];
        
        if (result?.fullTextAnnotation?.text) {
            return normalizeGoogleResult(result);
        } else if (result?.error) {
            throw new Error(`Google Vision错误: ${result.error.message}`);
        } else {
            throw new Error('Google Vision返回空结果');
        }
    } catch (error) {
        if (error.response?.data?.error) {
            throw new Error(`Google Vision错误: ${error.response.data.error.message}`);
        }
        throw error;
    }
}

/**
 * 标准化百度OCR结果
 */
function normalizeBaiduResult(wordsResult) {
    return {
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
        provider: 'baidu',
        raw: wordsResult
    };
}

/**
 * 标准化Google Vision结果
 * Google返回的是纯文本，需要正则提取关键信息
 */
function normalizeGoogleResult(result) {
    const text = result.fullTextAnnotation.text;
    
    // 使用正则表达式提取关键信息
    const extracted = extractInfoFromText(text);
    
    return {
        invoiceType: extracted.invoiceType || '未知',
        invoiceCode: extracted.invoiceCode || '',
        invoiceNum: extracted.invoiceNum || '',
        invoiceDate: extracted.invoiceDate || '',
        totalAmount: extracted.totalAmount || 0,
        totalTax: extracted.totalTax || 0,
        amountInFigures: extracted.amountInFigures || extracted.totalAmount || 0,
        sellerName: extracted.sellerName || '',
        sellerRegisterNum: extracted.sellerRegisterNum || '',
        purchaserName: extracted.purchaserName || '',
        commodityName: extracted.commodityName || '',
        provider: 'google',
        rawText: text, // Google返回原始文本
        raw: result
    };
}

/**
 * 从文本中提取发票信息（Google Vision用）
 */
function extractInfoFromText(text) {
    const result = {};
    
    // 发票类型
    if (text.includes('增值税专用发票')) {
        result.invoiceType = '增值税专用发票';
    } else if (text.includes('增值税普通发票')) {
        result.invoiceType = '增值税普通发票';
    }
    
    // 发票代码（10位或12位数字）
    const codeMatch = text.match(/发票代码[:：]?\s*(\d{10,12})/);
    if (codeMatch) result.invoiceCode = codeMatch[1];
    
    // 发票号码（8位或20位数字）
    const numMatch = text.match(/发票号码[:：]?\s*(\d{8,20})/);
    if (numMatch) result.invoiceNum = numMatch[1];
    
    // 开票日期
    const dateMatch = text.match(/(\d{4}[年/-]\d{1,2}[月/-]\d{1,2})/);
    if (dateMatch) result.invoiceDate = dateMatch[1];
    
    // 金额（多种格式）
    const amountMatches = text.match(/[¥￥]\s*([\d,]+\.?\d*)/g);
    if (amountMatches && amountMatches.length > 0) {
        // 通常最后一个最大金额是合计金额
        const amounts = amountMatches.map(a => parseAmount(a));
        result.totalAmount = Math.max(...amounts);
    }
    
    // 销售方名称
    const sellerMatch = text.match(/销售方.*?名称[:：]?\s*([^\n]+)/);
    if (sellerMatch) result.sellerName = sellerMatch[1].trim();
    
    // 购买方名称
    const purchaserMatch = text.match(/购买方.*?名称[:：]?\s*([^\n]+)/);
    if (purchaserMatch) result.purchaserName = purchaserMatch[1].trim();
    
    return result;
}

/**
 * 解析金额
 */
function parseAmount(amountStr) {
    if (!amountStr) return 0;
    if (typeof amountStr === 'number') return amountStr;
    
    const cleaned = amountStr.toString().replace(/[¥￥,$\s]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/**
 * 格式化发票信息为可读文本
 */
function formatInvoiceInfo(invoice) {
    const providerTag = invoice.provider === 'google' ? '🌐 Google Vision' : '🇨🇳 百度OCR';
    
    return `📄 **发票识别结果** ${providerTag}

🏢 **销售方**: ${invoice.sellerName || '未识别'}
👤 **购买方**: ${invoice.purchaserName || '未识别'}
📅 **开票日期**: ${invoice.invoiceDate || '未识别'}
🧾 **发票号码**: ${invoice.invoiceNum || '未识别'}
💰 **金额**: ¥${(invoice.amountInFigures || 0).toFixed(2)}
📦 **商品**: ${invoice.commodityName ? invoice.commodityName.substring(0, 50) + '...' : '未识别'}

请确认以上信息是否正确？
回复 "确认" 直接创建发票
回复 "修改" 告诉我需要修改的内容`;
}

/**
 * 转换为Xero发票格式
 */
function convertToXeroInvoice(ocrResult, customerName) {
    return {
        customerName: customerName || ocrResult.purchaserName || '未命名客户',
        amount: ocrResult.amountInFigures || ocrResult.totalAmount,
        description: `发票识别: ${ocrResult.commodityName || '商品服务'} (${ocrResult.invoiceNum || '无编号'})`,
        invoiceDate: ocrResult.invoiceDate,
        reference: ocrResult.invoiceNum
    };
}

/**
 * 获取OCR服务状态
 */
function getOCRStatus() {
    return {
        providers: Object.entries(OCR_PROVIDERS).map(([name, config]) => ({
            name: config.name,
            enabled: config.enabled,
            priority: config.priority
        })),
        available: getAvailableProviders()
    };
}

module.exports = {
    recognizeInvoice,
    formatInvoiceInfo,
    convertToXeroInvoice,
    getOCRStatus,
    // 以下是为了兼容旧版ocr.js的接口
    storePendingInvoice: require('./ocr').storePendingInvoice,
    getPendingInvoice: require('./ocr').getPendingInvoice,
    clearPendingInvoice: require('./ocr').clearPendingInvoice
};
