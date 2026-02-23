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
 * 支持：中国增值税发票、澳新 Tax Invoice
 */
function extractInfoFromText(text) {
    const result = {};
    const upperText = text.toUpperCase();
    
    // ===== 检测发票类型 =====
    // 中国发票
    if (text.includes('增值税专用发票')) {
        result.invoiceType = '增值税专用发票';
        result.invoiceRegion = 'CN';
    } else if (text.includes('增值税普通发票')) {
        result.invoiceType = '增值税普通发票';
        result.invoiceRegion = 'CN';
    }
    // 澳新 Tax Invoice
    else if (upperText.includes('TAX INVOICE') || upperText.includes('ABN') || upperText.includes('GST')) {
        result.invoiceType = 'Tax Invoice';
        result.invoiceRegion = detectRegion(text);
    }
    // 其他英文发票
    else if (upperText.includes('INVOICE')) {
        result.invoiceType = 'Invoice';
        result.invoiceRegion = detectRegion(text);
    }
    
    // ===== 中国发票字段提取 =====
    if (result.invoiceRegion === 'CN') {
        extractChineseInvoiceFields(text, result);
    }
    // ===== 澳新发票字段提取 =====
    else {
        extractAuNzInvoiceFields(text, result);
    }
    
    return result;
}

/**
 * 检测发票地区（AU/NZ/Unknown）
 */
function detectRegion(text) {
    const upperText = text.toUpperCase();
    // 澳洲特征
    if (upperText.includes('ABN') || upperText.includes('AUSTRALIA') || upperText.includes('AUD') || upperText.includes('$')) {
        // 进一步区分 AU 和 NZ
        if (upperText.includes('IRD') || upperText.includes('NZBN') || upperText.includes('NEW ZEALAND') || upperText.includes('NZD')) {
            return 'NZ';
        }
        return 'AU';
    }
    // 新西兰特征
    if (upperText.includes('GST') && (upperText.includes('IRD') || upperText.includes('NEW ZEALAND'))) {
        return 'NZ';
    }
    return 'AU'; // 默认澳洲
}

/**
 * 提取中国发票字段
 */
function extractChineseInvoiceFields(text, result) {
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
        const amounts = amountMatches.map(a => parseAmount(a));
        result.totalAmount = Math.max(...amounts);
    }
    
    // 销售方名称
    const sellerMatch = text.match(/销售方.*?名称[:：]?\s*([^\n]+)/);
    if (sellerMatch) result.sellerName = sellerMatch[1].trim();
    
    // 购买方名称
    const purchaserMatch = text.match(/购买方.*?名称[:：]?\s*([^\n]+)/);
    if (purchaserMatch) result.purchaserName = purchaserMatch[1].trim();
    
    // 纳税人识别号
    const taxNumMatch = text.match(/纳税人识别号[:：]?\s*([A-Z0-9]{15,20})/i);
    if (taxNumMatch) result.sellerRegisterNum = taxNumMatch[1];
}

/**
 * 提取澳新 Tax Invoice 字段
 */
function extractAuNzInvoiceFields(text, result) {
    const upperText = text.toUpperCase();
    
    // ===== ABN (澳洲商业号码) =====
    // 格式: 11位数字，通常有空格分隔如 "12 345 678 901"
    const abnMatch = text.match(/ABN[:\s]*(\d{2}\s*\d{3}\s*\d{3}\s*\d{3})/i) ||
                     text.match(/ABN[:\s]*(\d{11})/i) ||
                     text.match(/A\.?B\.?N\.?[:\s]*(\d[\d\s]{10,})/i);
    if (abnMatch) {
        result.sellerRegisterNum = abnMatch[1].replace(/\s/g, ''); // 去掉空格
        result.abn = result.sellerRegisterNum;
    }
    
    // ===== NZBN (新西兰商业号码) =====
    const nzbnMatch = text.match(/NZBN[:\s]*(\d{13})/i);
    if (nzbnMatch) {
        result.sellerRegisterNum = nzbnMatch[1];
        result.nzbn = nzbnMatch[1];
    }
    
    // ===== GST 号码 =====
    const gstMatch = text.match(/GST[:\s]*(\d{2,3}[-\s]?\d{3}[-\s]?\d{3})/i);
    if (gstMatch) result.gstNumber = gstMatch[1].replace(/[-\s]/g, '');
    
    // ===== Invoice Number =====
    // 多种格式：Invoice #, Inv #, Invoice No., Reference 等
    const invNumMatches = [
        text.match(/Invoice\s*#?[:\s]*([A-Z0-9\-]+)/i),
        text.match(/Inv\.?\s*#?[:\s]*([A-Z0-9\-]+)/i),
        text.match(/Invoice\s*(?:No|Number)\.?[:\s]*([A-Z0-9\-]+)/i),
        text.match(/Reference[:\s]*([A-Z0-9\-]+)/i),
        text.match(/Invoice\s*ID[:\s]*([A-Z0-9\-]+)/i)
    ];
    for (const match of invNumMatches) {
        if (match && match[1] && match[1].length > 2) {
            result.invoiceNum = match[1].trim();
            break;
        }
    }
    
    // ===== 日期 =====
    // 澳新格式：15 Jan 2024, 15/01/2024, 15-01-2024, Jan 15, 2024
    const dateMatches = [
        // 15 Jan 2024 或 15 January 2024
        text.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{4})/i),
        // Jan 15, 2024
        text.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})[,\s]+(\d{4})/i),
        // 15/01/2024 或 15-01-2024 (日/月/年)
        text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/),
        // 2024-01-15 (ISO格式)
        text.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/)
    ];
    
    for (const match of dateMatches) {
        if (match) {
            result.invoiceDate = formatAuNzDate(match);
            break;
        }
    }
    
    // ===== 金额 =====
    // 澳新使用 $ 符号，可能标注 AUD 或 NZD
    const amountPatterns = [
        // Total Amount: $1,234.56
        text.match(/Total\s*(?:Amount)?[:\s]*\$?\s*([\d,]+\.\d{2})/i),
        // Amount Due: $1,234.56
        text.match(/Amount\s*Due[:\s]*\$?\s*([\d,]+\.\d{2})/i),
        // Balance Due: $1,234.56
        text.match(/Balance\s*Due[:\s]*\$?\s*([\d,]+\.\d{2})/i),
        // Total: $1,234.56
        text.match(/Total[:\s]+\$?\s*([\d,]+\.\d{2})/i),
        // GST Total: $123.45
        text.match(/GST\s*Total[:\s]*\$?\s*([\d,]+\.\d{2})/i)
    ];
    
    for (const match of amountPatterns) {
        if (match && match[1]) {
            const amount = parseAmount(match[1]);
            if (amount > 0) {
                // 优先使用 Total Amount，其次是 Amount Due
                if (!result.totalAmount || match[0].toLowerCase().includes('total')) {
                    result.totalAmount = amount;
                }
            }
        }
    }
    
    // 如果没有找到 totalAmount，尝试找所有 $ 金额取最大值
    if (!result.totalAmount) {
        const allAmounts = text.match(/\$\s*([\d,]+\.?\d*)/g);
        if (allAmounts && allAmounts.length > 0) {
            const amounts = allAmounts.map(a => parseAmount(a));
            result.totalAmount = Math.max(...amounts);
        }
    }
    
    // ===== 销售方名称 =====
    // 通常在发票顶部，ABN 附近
    const sellerMatches = [
        // 从 ABN 行往上找公司名称
        text.match(/([A-Z][A-Za-z0-9\s&.,'-]+(?:Pty|Ltd|Limited|Inc|Corp|Co\.?|Company|Services?|Trading|Group))\s*\n.*ABN/i),
        // From: Company Name
        text.match(/From[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]+)/i),
        // 发票抬头附近
        text.match(/(?:Tax\s*)?Invoice\s*\n\s*([A-Z][A-Za-z0-9\s&.,'-]+(?:Pty|Ltd|Limited))/i)
    ];
    
    for (const match of sellerMatches) {
        if (match && match[1]) {
            const name = match[1].trim();
            if (name.length > 2 && !name.toLowerCase().includes('invoice')) {
                result.sellerName = name;
                break;
            }
        }
    }
    
    // ===== 购买方名称 =====
    // Bill To: 或 To: 或 Customer:
    const purchaserMatches = [
        text.match(/Bill\s*To[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]+)/i),
        text.match(/To[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]+)/i),
        text.match(/Customer[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]+)/i),
        text.match(/Sold\s*To[:\s]*\n?\s*([A-Z][A-Za-z0-9\s&.,'-]+)/i)
    ];
    
    for (const match of purchaserMatches) {
        if (match && match[1]) {
            const name = match[1].trim();
            if (name.length > 2) {
                result.purchaserName = name;
                break;
            }
        }
    }
    
    // ===== GST 金额 =====
    const gstAmountMatch = text.match(/GST[:\s]*\$?\s*([\d,]+\.\d{2})/i) ||
                           text.match(/Tax[:\s]*\$?\s*([\d,]+\.\d{2})/i);
    if (gstAmountMatch) {
        result.totalTax = parseAmount(gstAmountMatch[1]);
    }
    
    // ===== 商品/服务描述 =====
    // 尝试提取 Description 列的内容
    const descMatch = text.match(/Description\s*\n+([\s\S]{10,200}?)(?:\n\s*\n|\n\s*(?:Qty|Quantity|Subtotal|Total))/i);
    if (descMatch) {
        result.commodityName = descMatch[1].replace(/\n/g, ', ').trim().substring(0, 100);
    }
}

/**
 * 格式化澳新日期为标准格式
 */
function formatAuNzDate(match) {
    const months = {
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04',
        'may': '05', 'jun': '06', 'jul': '07', 'aug': '08',
        'sep': '09', 'oct': '10', 'nov': '11', 'dec': '12'
    };
    
    // 判断匹配类型并格式化
    if (match[2] && months[match[2].toLowerCase()]) {
        // 15 Jan 2024 格式
        const day = match[1].padStart(2, '0');
        const month = months[match[2].toLowerCase()];
        const year = match[3];
        return `${year}-${month}-${day}`;
    } else if (match[1].length === 4) {
        // 2024-01-15 ISO格式
        return `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    } else {
        // 15/01/2024 格式（澳新是日/月/年）
        const day = match[1].padStart(2, '0');
        const month = match[2].padStart(2, '0');
        const year = match[3];
        return `${year}-${month}-${day}`;
    }
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
 * 支持：中国增值税发票、澳新 Tax Invoice
 */
function formatInvoiceInfo(invoice) {
    const providerTag = invoice.provider === 'google' ? '🌐 Google Vision' : '🇨🇳 百度OCR';
    
    // 根据地区选择货币符号和标签
    const isAuNz = invoice.invoiceRegion === 'AU' || invoice.invoiceRegion === 'NZ';
    const currencySymbol = isAuNz ? '$' : '¥';
    const regionTag = invoice.invoiceRegion === 'AU' ? '🇦🇺 澳洲' : 
                      invoice.invoiceRegion === 'NZ' ? '🇳🇿 新西兰' : '🇨🇳 中国';
    
    // 构建显示内容
    let display = `📄 **发票识别结果** ${providerTag} ${regionTag}

`;
    
    // 发票类型
    display += `🧾 **发票类型**: ${invoice.invoiceType || '未识别'}\n`;
    
    // 销售方信息
    if (isAuNz && invoice.abn) {
        display += `🏢 **销售方**: ${invoice.sellerName || '未识别'}\n`;
        display += `📋 **ABN**: ${invoice.abn}\n`;
    } else if (isAuNz && invoice.nzbn) {
        display += `🏢 **销售方**: ${invoice.sellerName || '未识别'}\n`;
        display += `📋 **NZBN**: ${invoice.nzbn}\n`;
    } else {
        display += `🏢 **销售方**: ${invoice.sellerName || '未识别'}\n`;
        if (invoice.sellerRegisterNum) {
            display += `📋 **税号**: ${invoice.sellerRegisterNum}\n`;
        }
    }
    
    // 购买方
    display += `👤 **购买方**: ${invoice.purchaserName || '未识别'}\n`;
    
    // 发票号码和日期
    display += `📅 **开票日期**: ${invoice.invoiceDate || '未识别'}\n`;
    display += `🔢 **发票号码**: ${invoice.invoiceNum || '未识别'}\n`;
    
    // 金额信息
    const amount = invoice.amountInFigures || invoice.totalAmount || 0;
    display += `💰 **金额**: ${currencySymbol}${amount.toFixed(2)}\n`;
    
    // GST/Tax 信息（澳新）
    if (isAuNz && invoice.totalTax) {
        display += `📊 **GST**: ${currencySymbol}${invoice.totalTax.toFixed(2)}\n`;
    }
    
    // 商品描述
    if (invoice.commodityName) {
        display += `📦 **商品/服务**: ${invoice.commodityName.substring(0, 50)}${invoice.commodityName.length > 50 ? '...' : ''}\n`;
    }
    
    display += `\n请确认以上信息是否正确？
回复 "确认" 直接创建发票
回复 "修改" 告诉我需要修改的内容`;
    
    return display;
}

/**
 * 转换为Xero发票格式
 * 支持：中国增值税发票、澳新 Tax Invoice
 */
function convertToXeroInvoice(ocrResult, customerName) {
    const isAuNz = ocrResult.invoiceRegion === 'AU' || ocrResult.invoiceRegion === 'NZ';
    
    // 构建描述信息
    let description = `发票识别: ${ocrResult.commodityName || '商品服务'}`;
    if (ocrResult.invoiceNum) {
        description += ` (编号: ${ocrResult.invoiceNum})`;
    }
    
    // 澳新发票添加 ABN/GST 信息
    if (isAuNz) {
        if (ocrResult.abn) {
            description += ` [ABN: ${ocrResult.abn}]`;
        } else if (ocrResult.nzbn) {
            description += ` [NZBN: ${ocrResult.nzbn}]`;
        }
        if (ocrResult.totalTax) {
            description += ` [GST: $${ocrResult.totalTax.toFixed(2)}]`;
        }
    }
    
    // 确定客户名称
    let finalCustomerName = customerName;
    if (!finalCustomerName) {
        if (isAuNz && ocrResult.purchaserName) {
            finalCustomerName = ocrResult.purchaserName;
        } else if (ocrResult.purchaserName) {
            finalCustomerName = ocrResult.purchaserName;
        } else {
            finalCustomerName = '未命名客户';
        }
    }
    
    return {
        customerName: finalCustomerName,
        amount: ocrResult.amountInFigures || ocrResult.totalAmount || 0,
        description: description,
        invoiceDate: ocrResult.invoiceDate,
        reference: ocrResult.invoiceNum || '',
        // 附加信息（供后续使用）
        region: ocrResult.invoiceRegion,
        abn: ocrResult.abn,
        nzbn: ocrResult.nzbn,
        gstAmount: ocrResult.totalTax
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
