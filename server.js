require('dotenv').config();

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const xero = require('./xero-multiuser');  // 使用多用户版本
const ocr = require('./ocr-unified');
const logger = require('./utils/logger');
const db = require('./db');

const app = express();

// 原始 body 解析 - 保留原始数据
app.use(express.raw({ type: '*/*' }));

// 配置
const PORT = process.env.PORT || 3000;
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;
const MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY;

// 启动时检查必需的环境变量
if (!FEISHU_APP_ID || !FEISHU_APP_SECRET || !MOONSHOT_API_KEY) {
    console.error('❌ 缺少必需的环境变量，请检查 .env 文件');
    console.error('  需要: FEISHU_APP_ID, FEISHU_APP_SECRET, MOONSHOT_API_KEY');
    process.exit(1);
}

// Kimi API 配置
const KIMI_API_URL = 'https://api.moonshot.cn/v1/chat/completions';

// 系统提示词
const SYSTEM_PROMPT = `你是 Bizmate，专为海外华人中小企业打造的 AI 运营助手。

你的使命：让华人企业主用母语就能高效管理生意，成为他们的 AI 运营合伙人。

## 当前已接入的插件

### 🔌 Xero 财务插件（已启用）
你可以帮助用户：
1. 查询应收账款 - 谁欠我钱？逾期多久？
2. 创建发票 - 为客户开具账单
3. 查询发票列表 - 查看所有发票状态
4. 查询客户列表 - 管理客户档案
5. 查询客户历史 - 某个客户的所有交易记录
6. **BAS/GST 税务解读** - 用中文解释要交多少税、什么时候交、怎么优化
7. **现金流预测** - 预测未来30天资金情况，预警资金缺口
8. 财务建议 - 基于数据的经营建议
9. **发票识别（OCR）** - 用户发送发票照片，系统自动识别内容并创建Xero账单
   - ✅ 已启用 Google Cloud Vision OCR
   - 📷 使用方法：直接发送发票照片（不要发文字询问）
   - 🔄 流程：发送照片 → 系统自动识别 → 用户确认 → 创建Xero发票

#### BAS/GST 税务解读功能说明
当用户问"这个月要交多少税"、"BAS怎么填"、"GST多少"时：
- 自动识别用户是澳洲还是新西兰
- 从 Xero 读取本季度税务数据
- 用中文解释：应缴多少、能否退税、截止日期
- 提供优化建议（如：是否有遗漏的进项税抵扣）

#### 现金流预测功能说明
当用户问"最近资金紧不紧"、"会不会缺钱"、"现金流怎么样"时：
- 分析当前银行余额
- 统计未来30天应收账款（即将到账）
- 统计未来30天应付账款（即将支付）
- 预警资金缺口，提供建议（如：加快催收、安排付款计划）

## 即将上线的插件

### 📊 市场情报插件（开发中）
- 竞品价格监控
- 行业趋势分析
- 汇率预警

### 👥 CRM 插件（规划中）
- 客户跟进提醒
- 商机管理
- 营销自动化

### 📦 供应链插件（规划中）
- 库存预警
- 物流追踪
- 供应商管理

## 你的独特优势

1. **双语无缝切换** - 用户说中文，系统自动对接英文系统
2. **本地化合规** - 深度理解澳洲/新西兰税务、劳工、商业法规
3. **华人商业习惯** - 懂微信生态、红包文化、关系维护
4. ** proactive 服务** - 不只是回答问题，主动提醒、建议、预警

## 回答风格

- 专业但亲切，像一位经验丰富的财务顾问
- 善用 emoji 和表格让数据直观
- 主动思考用户可能的下一步需求
- 不清楚时诚实告知，不瞎编

## 重要说明

- 当前财务数据来自 Xero 实时同步
- 支持澳元(AUD)和新西兰元(NZD)
- 所有操作都有确认环节，避免误操作
- 用户数据严格保密，符合当地隐私法规`;


// Function Calling 工具定义
const XERO_TOOLS = [
    {
        type: "function",
        function: {
            name: "get_customer_invoices",
            description: "查询指定客户的历史发票记录",
            parameters: {
                type: "object",
                properties: {
                    customer_name: { type: "string", description: "客户名称" }
                },
                required: ["customer_name"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_receivables_summary",
            description: "获取应收账款汇总，显示每个客户的未付金额",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "get_all_invoices",
            description: "获取所有发票列表",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "get_all_customers",
            description: "获取所有客户/联系人列表",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "create_invoice",
            description: "为客户创建新发票",
            parameters: {
                type: "object",
                properties: {
                    customer_name: { type: "string", description: "客户名称" },
                    amount: { type: "number", description: "金额" },
                    description: { type: "string", description: "服务描述" }
                },
                required: ["customer_name", "amount"]
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_bas_report",
            description: "获取 BAS/GST 税务报告，自动识别澳洲或新西兰，用中文解读税务数据、截止日期和优化建议",
            parameters: { type: "object", properties: {} }
        }
    },
    {
        type: "function",
        function: {
            name: "get_cashflow_forecast",
            description: "获取现金流预测，分析未来30天的资金流入流出情况，预警资金缺口",
            parameters: {
                type: "object",
                properties: {
                    days: { type: "number", description: "预测天数，默认30天", default: 30 }
                }
            }
        }
    },
    {
        type: "function",
        function: {
            name: "get_invoice_pdf",
            description: "获取指定发票的 PDF 文件，可以通过发票编号或发票ID获取",
            parameters: {
                type: "object",
                properties: {
                    invoice_number: { type: "string", description: "发票编号，如 INV-0001（可选，与 invoice_id 二选一）" },
                    invoice_id: { type: "string", description: "发票ID（可选，与 invoice_number 二选一）" }
                }
            }
        }
    }
];

// 对话历史管理 - 使用 SQLite 持久化存储
const MAX_HISTORY_LENGTH = 20;

/**
 * 获取对话历史（从数据库）
 * @param {string} userId - 用户ID
 * @returns {Array} 消息数组
 */
async function getHistory(userId) {
    return await db.getHistory(userId, MAX_HISTORY_LENGTH);
}

/**
 * 保存对话历史（到数据库）
 * @param {string} userId - 用户ID
 * @param {string} userMsg - 用户消息
 * @param {string} assistantMsg - 助手回复
 */
async function saveHistory(userId, userMsg, assistantMsg) {
    await db.saveMessage(userId, 'user', userMsg);
    await db.saveMessage(userId, 'assistant', assistantMsg);
}

// 工具执行器
async function executeToolCall(toolCall) {
    const { name, arguments: argsStr } = toolCall.function;
    const args = JSON.parse(argsStr || '{}');

    logger.info(`Executing tool: ${name}`, { args });

    try {
        let result;
        switch (name) {
            case 'get_customer_invoices':
                result = await xero.getCustomerInvoices(args.customer_name);
                break;
            case 'get_receivables_summary':
                result = await xero.getReceivablesSummary();
                break;
            case 'get_all_invoices':
                result = await xero.getAllInvoices();
                break;
            case 'get_all_customers':
                result = await xero.getAllCustomers();
                break;
            case 'create_invoice':
                result = await xero.createInvoice(args);
                break;
            case 'get_bas_report':
                result = await xero.getBASReport();
                break;
            case 'get_cashflow_forecast':
                result = await xero.getCashflowForecast(args.days || 30);
                break;
            case 'get_invoice_pdf':
                // 获取发票 PDF
                if (args.invoice_number) {
                    const pdfData = await xero.getInvoicePDFByNumber(args.invoice_number);
                    // 生成下载链接
                    const baseUrl = process.env.BASE_URL || 'https://xero-invoice-bot-1.onrender.com';
                    // 需要先获取发票ID
                    const invoices = await xero.getAllInvoices();
                    const invoice = invoices.find(inv => inv.InvoiceNumber === args.invoice_number);
                    if (invoice) {
                        result = {
                            success: true,
                            message: `📄 发票 ${args.invoice_number} 的 PDF 已准备好`,
                            download_url: `${baseUrl}/xero/invoice/${invoice.InvoiceID}/pdf`,
                            invoice_number: args.invoice_number,
                            invoice_id: invoice.InvoiceID,
                            customer_name: invoice.Contact?.Name,
                            total: invoice.Total,
                            status: invoice.Status
                        };
                    } else {
                        result = { error: `找不到发票 ${args.invoice_number}` };
                    }
                } else if (args.invoice_id) {
                    const pdfData = await xero.getInvoicePDF(args.invoice_id);
                    const baseUrl = process.env.BASE_URL || 'https://xero-invoice-bot-1.onrender.com';
                    result = {
                        success: true,
                        message: `📄 发票 PDF 已准备好`,
                        download_url: `${baseUrl}/xero/invoice/${args.invoice_id}/pdf`,
                        invoice_id: args.invoice_id
                    };
                } else {
                    result = { error: '请提供发票编号 (invoice_number) 或发票ID (invoice_id)' };
                }
                break;
            default:
                return { error: `Unknown tool: ${name}` };
        }
        
        logger.info(`Tool ${name} executed successfully`);
        return result;
    } catch (error) {
        logger.error(`Tool execution failed: ${name}`, error);
        
        // 处理特定错误代码
        if (error.message === 'XERO_NOT_AUTHENTICATED') {
            return { 
                error: '🔐 Xero 未连接',
                message: '请访问 https://xero-invoice-bot-1.onrender.com/xero/auth 重新授权',
                action_required: 'reauthorize'
            };
        }
        
        if (error.message === 'XERO_NO_TENANT') {
            return {
                error: '🏢 未找到 Xero 组织',
                message: '请确保您的 Xero 账户已连接到应用',
                action_required: 'check_connection'
            };
        }
        
        if (error.code === 'XERO_UNAUTHORIZED') {
            return {
                error: '🔐 Xero 授权已过期',
                message: '请重新授权以继续使用',
                action_required: 'reauthorize'
            };
        }
        
        // 通用错误
        return { 
            error: '❌ 操作失败',
            message: error.message || '请稍后重试',
            action_required: 'retry'
        };
    }
}

// 调用 Kimi API
async function callKimiAPI(messages) {
    const response = await axios.post(KIMI_API_URL, {
        model: 'kimi-k2.5',
        messages: messages,
        tools: XERO_TOOLS
    }, {
        headers: {
            'Authorization': `Bearer ${MOONSHOT_API_KEY}`,
            'Content-Type': 'application/json'
        },
        timeout: 60000
    });
    return response.data;
}

// 核心消息处理函数
async function processUserMessage(userId, userText) {
    try {
        console.log('开始处理用户消息:', userText.substring(0, 50) + '...');
        const history = await getHistory(userId);
        console.log('历史消息数量:', history.length);

        let messages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...history,
            { role: 'user', content: userText }
        ];

        console.log('调用 Kimi API...');
        // 第一轮：调用 Kimi
        let response = await callKimiAPI(messages);
        console.log('Kimi API 响应成功');
        let assistantMessage = response.choices[0].message;

        // 如果 AI 要调用工具，循环处理
        while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
            console.log('AI 调用工具:', assistantMessage.tool_calls.map(t => t.function.name));
            messages.push(assistantMessage);

            for (const toolCall of assistantMessage.tool_calls) {
                const result = await executeToolCall(toolCall);
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: JSON.stringify(result)
                });
            }

            // 再次调用 Kimi
            console.log('再次调用 Kimi API...');
            response = await callKimiAPI(messages);
            assistantMessage = response.choices[0].message;
        }

        const reply = assistantMessage.content;
        console.log('AI 回复:', reply.substring(0, 100) + '...');
        await saveHistory(userId, userText, reply);
        return reply;
    } catch (error) {
        console.error('processUserMessage 出错:', error.message);
        console.error('错误堆栈:', error.stack);
        throw error;
    }
}

// 存储已处理的消息ID（防重复）
const processedMessages = new Set();

// ===============================
// 飞书签名验证
// ===============================
function verifyFeishuSignature(body, signature, timestamp, nonce) {
    if (!signature || !timestamp || !nonce) {
        console.log('Missing signature headers');
        return true;
    }
    
    const content = timestamp + nonce + body;
    const hash = crypto.createHmac('sha256', FEISHU_APP_SECRET)
        .update(content)
        .digest('hex');
    
    return hash === signature;
}

// ===============================
// 获取飞书 Token
// ===============================
let cachedFeishuToken = null;
let tokenExpiry = 0;

async function getFeishuToken() {
    // 如果缓存的 token 还有效，直接返回
    if (cachedFeishuToken && Date.now() < tokenExpiry) {
        return cachedFeishuToken;
    }

    try {
        console.log('获取飞书 tenant access token...');
        // 使用 tenant_access_token 接口，这是下载图片等操作需要的
        const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
            app_id: FEISHU_APP_ID,
            app_secret: FEISHU_APP_SECRET
        });

        if (response.data && response.data.tenant_access_token) {
            cachedFeishuToken = response.data.tenant_access_token;
            // token 有效期通常是 2 小时，这里设置 1.5 小时后过期
            tokenExpiry = Date.now() + (90 * 60 * 1000);
            console.log('飞书 tenant token 获取成功');
            return cachedFeishuToken;
        } else {
            console.error('获取 tenant token 失败，响应:', response.data);
        }
    } catch (error) {
        console.error('获取飞书 token 失败:', error.message);
        if (error.response) {
            console.error('错误响应:', error.response.data);
        }
    }
    return null;
}

// ===============================
// 发送飞书消息（带重试）
// ===============================
async function sendFeishuMessage(chatId, text, token, retryCount = 0) {
    const MAX_RETRIES = 3;
    const MAX_LENGTH = 7000;
    
    try {
        console.log(`发送消息到飞书 (长度: ${text.length} 字符, 重试: ${retryCount})`);
        
        if (text.length <= MAX_LENGTH) {
            const response = await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                receive_id: chatId,
                msg_type: 'text',
                content: JSON.stringify({ text: text })
            }, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 15000
            });
            console.log('消息发送成功:', response.data?.code === 0 ? 'OK' : response.data);
        } else {
            console.log(`消息太长 (${text.length} 字符)，分段发送...`);
            
            const firstPart = text.substring(0, MAX_LENGTH) + '\n\n...(内容太长，继续发送剩余部分)';
            await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                receive_id: chatId,
                msg_type: 'text',
                content: JSON.stringify({ text: firstPart })
            }, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 15000
            });
            
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            const secondPart = '(接上条)\n\n' + text.substring(MAX_LENGTH);
            await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                receive_id: chatId,
                msg_type: 'text',
                content: JSON.stringify({ text: secondPart })
            }, {
                headers: { 'Authorization': `Bearer ${token}` },
                timeout: 15000
            });
        }
    } catch (error) {
        console.error(`发送飞书消息失败 (重试 ${retryCount}):`, error.message);
        if (error.code) console.error('错误代码:', error.code);
        if (error.response) {
            console.error('HTTP 状态:', error.response.status);
            console.error('错误详情:', error.response.data);
        }
        
        if (retryCount < MAX_RETRIES) {
            console.log(`等待 2 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            return sendFeishuMessage(chatId, text, token, retryCount + 1);
        } else {
            console.error('达到最大重试次数，放弃发送');
            try {
                await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id', {
                    receive_id: chatId,
                    msg_type: 'text',
                    content: JSON.stringify({ text: '⚠️ 抱歉，消息发送失败，请稍后重试。' })
                }, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    timeout: 10000
                });
            } catch (e) {
                console.error('连错误消息都发送失败:', e.message);
            }
        }
    }
}

// ===============================
// 处理图片消息（OCR识别发票）
// ===============================
async function handleImageMessage(chatId, userId, content, token) {
    try {
        // 解析图片内容
        let imageContent;
        try {
            imageContent = JSON.parse(content);
        } catch {
            await sendFeishuMessage(chatId, '❌ 无法解析图片信息', token);
            return;
        }

        const imageKey = imageContent.image_key;
        if (!imageKey) {
            await sendFeishuMessage(chatId, '❌ 无法获取图片', token);
            return;
        }

        console.log('获取图片内容, image_key:', imageKey);
        await sendFeishuMessage(chatId, '⏳ 正在识别发票内容...', token);

        // 从飞书下载图片
        const imageBase64 = await downloadFeishuImage(imageKey, token);
        if (!imageBase64) {
            await sendFeishuMessage(chatId, '❌ 无法下载图片，请重试', token);
            return;
        }

        console.log('图片下载成功，开始OCR识别...');

        // OCR识别
        const invoiceData = await ocr.recognizeInvoice(imageBase64);
        console.log('发票识别结果:', JSON.stringify(invoiceData, null, 2));

        // 存储待确认的发票
        await ocr.storePendingInvoice(userId, invoiceData);

        // 发送识别结果给用户确认
        const formattedInfo = ocr.formatInvoiceInfo(invoiceData);
        await sendFeishuMessage(chatId, formattedInfo, token);

    } catch (error) {
        console.error('处理图片消息失败:', error.message);
        await sendFeishuMessage(chatId, `❌ 发票识别失败: ${error.message}\n\n请确保：\n1. 图片清晰可读\n2. 是正规发票\n3. 重试或手动输入信息`, token);
    }
}

// ===============================
// 从飞书下载图片
// ===============================
async function downloadFeishuImage(imageKey, token) {
    try {
        console.log('获取飞书图片下载链接:', imageKey);
        console.log('使用 Token (前20位):', token ? token.substring(0, 20) + '...' : 'null');
        
        // 第一步：获取图片下载链接
        // 注意：需要添加 size 参数，可选值: 0(原始大小), 1(大图), 2(缩略图)
        const linkResponse = await axios.get(
            `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}?size=0`,
            {
                headers: { 
                    'Authorization': `Bearer ${token}`
                },
                timeout: 30000
            }
        );

        console.log('图片链接响应状态:', linkResponse.status);
        console.log('图片链接响应数据:', JSON.stringify(linkResponse.data, null, 2));

        // 检查响应 - 飞书 API 返回的 code 为 0 表示成功
        if (linkResponse.data?.code !== 0) {
            console.error('获取图片链接失败:', linkResponse.data?.msg || '未知错误', 'code:', linkResponse.data?.code);
            return null;
        }

        // 获取图片下载 URL
        const imageUrl = linkResponse.data?.data?.image_url;
        if (!imageUrl) {
            console.error('未获取到图片下载 URL');
            return null;
        }

        console.log('获取到图片下载 URL，开始下载...');

        // 第二步：下载图片内容
        const imageResponse = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (imageResponse.data) {
            // 转换为 base64
            const base64 = Buffer.from(imageResponse.data).toString('base64');
            console.log('图片下载成功，大小:', imageResponse.data.length, 'bytes');
            return base64;
        }
    } catch (error) {
        console.error('下载飞书图片失败:', error.message);
        if (error.response) {
            console.error('HTTP状态:', error.response.status);
            console.error('错误详情:', error.response.data);
        }
        if (error.code) {
            console.error('错误代码:', error.code);
        }
    }
    return null;
}

// ===============================
// 处理发票确认
// ===============================
async function handleInvoiceConfirmation(chatId, userId, text, pendingInvoice, token) {
    const lowerText = text.toLowerCase();

    if (lowerText.includes('确认') || lowerText.includes('是的') || lowerText === 'ok') {
        // 用户确认，创建发票
        try {
            await sendFeishuMessage(chatId, '⏳ 正在创建Xero发票...', token);

            // 转换为Xero发票格式
            const xeroInvoice = ocr.convertToXeroInvoice(pendingInvoice);
            
            // 创建发票
            const result = await xero.createInvoice(userId, xeroInvoice);
            
            // 清除待确认状态
            await ocr.clearPendingInvoice(userId);

            await sendFeishuMessage(chatId, 
                `✅ **发票创建成功！**\n\n` +
                `📄 发票ID: ${result.InvoiceID}\n` +
                `👤 客户: ${result.Contact?.Name}\n` +
                `💰 金额: $${result.Total}\n` +
                `📅 日期: ${result.DateString}\n\n` +
                `您可以在Xero中查看详情。`, 
                token
            );

        } catch (error) {
            console.error('创建发票失败:', error.message);
            await sendFeishuMessage(chatId, 
                `❌ **创建发票失败**\n\n` +
                `错误: ${error.message}\n\n` +
                `可能原因：\n` +
                `• Xero未认证 - 请先访问 /xero/auth\n` +
                `• 客户不存在 - 先在Xero中创建客户\n` +
                `• 网络超时 - 请稍后重试`, 
                token
            );
        }

    } else if (lowerText.includes('修改') || lowerText.includes('取消')) {
        // 用户取消或修改
        await ocr.clearPendingInvoice(userId);
        await sendFeishuMessage(chatId, 
            `📝 已取消发票创建。\n\n` +
            `您可以：\n` +
            `• 重新发送发票照片\n` +
            `• 或告诉我正确的信息，我帮您手动创建`, 
            token
        );

    } else {
        // 用户发送了其他内容，提示确认
        await sendFeishuMessage(chatId, 
            `🤔 我检测到您有待确认的发票。\n\n` +
            `请回复：\n` +
            `• **确认** - 创建发票\n` +
            `• **修改/取消** - 重新开始\n\n` +
            `或直接发送新消息继续其他操作。`, 
            token
        );
    }
}

// ===============================
// 解析请求体
// ===============================
function parseBody(req) {
    try {
        if (Buffer.isBuffer(req.body)) {
            const bodyString = req.body.toString('utf-8');
            console.log('Raw body (first 500 chars):', bodyString.substring(0, 500));
            return JSON.parse(bodyString);
        }
        return req.body;
    } catch (error) {
        console.error('解析 body 失败:', error.message);
        return null;
    }
}

// ===============================
// Xero OAuth 路由（多用户版本）
// ===============================
app.get('/xero/auth', (req, res) => {
    // 获取用户ID（从查询参数或会话中）
    const userId = req.query.user_id;
    
    if (!userId) {
        return res.status(400).json({
            error: 'Missing user_id',
            message: '请提供 user_id 参数，格式: /xero/auth?user_id=feishu:xxx'
        });
    }
    
    const authUrl = xero.generateAuthUrl(userId);
    res.redirect(authUrl);
});

app.get('/xero/callback', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    const error = req.query.error;
    const errorDescription = req.query.error_description;
    
    // 记录完整的查询参数，用于调试
    console.log('Xero callback received:', {
        query: req.query,
        code: code ? 'present' : 'missing',
        state: state ? 'present' : 'missing',
        error: error,
        errorDescription: errorDescription
    });
    
    if (error) {
        return res.status(400).json({ 
            error: 'Xero authorization failed',
            xero_error: error,
            description: errorDescription 
        });
    }
    
    if (!code || !state) {
        return res.status(400).json({ 
            error: 'Missing code or state',
            query_params: req.query 
        });
    }

    try {
        const result = await xero.handleCallback(code, state);
        
        if (!result.success) {
            throw new Error(result.error || 'Authorization failed');
        }
        res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Bizmate - Xero 认证成功</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                    .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    h1 { color: #4CAF50; }
                    .icon { font-size: 60px; margin: 20px 0; }
                    .btn { display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">✅</div>
                    <h1>Xero 认证成功！</h1>
                    <p>您的 Xero 账户已成功连接到 Bizmate。</p>
                    <p>现在您可以：</p>
                    <ul style="text-align: left; display: inline-block;">
                        <li>查询应收账款</li>
                        <li>创建发票</li>
                        <li>查看财务报表</li>
                    </ul>
                    <br><br>
                    <a href="/" class="btn">返回 Bizmate</a>
                </div>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send(`
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Bizmate - 认证失败</title>
                <style>
                    body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                    .container { background: white; padding: 40px; border-radius: 10px; max-width: 500px; margin: 0 auto; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    h1 { color: #f44336; }
                    .icon { font-size: 60px; margin: 20px 0; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="icon">❌</div>
                    <h1>认证失败</h1>
                    <p>错误信息：${error.message}</p>
                    <p>请重试或联系技术支持。</p>
                </div>
            </body>
            </html>
        `);
    }
});

// ===============================
// 获取发票 PDF
// ===============================
app.get('/xero/invoice/:invoiceId/pdf', async (req, res) => {
    try {
        const { invoiceId } = req.params;
        logger.info('PDF download request', { invoiceId });
        
        const pdfData = await xero.getInvoicePDF(invoiceId);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${pdfData.filename}"`);
        res.send(pdfData.pdfBuffer);
        
        logger.info('PDF sent successfully', { invoiceId, size: pdfData.pdfBuffer.length });
    } catch (error) {
        logger.error('Failed to download PDF', error);
        
        if (error.message === 'XERO_NOT_AUTHENTICATED') {
            return res.status(401).json({ 
                error: 'Xero 未授权',
                message: '请先访问 /xero/auth 进行授权'
            });
        }
        
        if (error.message === 'XERO_NO_TENANT') {
            return res.status(400).json({ 
                error: '未找到 Xero 组织',
                message: '请确保 Xero 账户已连接'
            });
        }
        
        if (error.message?.includes('INVOICE_NOT_FOUND')) {
            return res.status(404).json({ 
                error: '发票不存在',
                message: error.message 
            });
        }
        
        res.status(500).json({ 
            error: '获取 PDF 失败',
            message: error.message 
        });
    }
});

// ===============================
// 健康检查
// ===============================
app.get('/health', async (req, res) => {
    const xeroStatus = await xero.healthCheck();
    const ocrStatus = ocr.getOCRStatus();
    const dbStats = await db.getStats();
    res.json({
        status: 'running',
        service: 'bizmate',
        xero: xeroStatus,
        ocr: ocrStatus,
        database: dbStats,
        timestamp: new Date().toISOString()
    });
});

// ===============================
// 调试端点（仅用于排查问题）
// ===============================
app.get('/debug/env', (req, res) => {
    res.json({
        google_vision: {
            configured: !!process.env.GOOGLE_VISION_API_KEY,
            key_length: process.env.GOOGLE_VISION_API_KEY ? process.env.GOOGLE_VISION_API_KEY.length : 0,
            key_preview: process.env.GOOGLE_VISION_API_KEY ? process.env.GOOGLE_VISION_API_KEY.substring(0, 10) + '...' : null
        },
        baidu_ocr: {
            api_key_configured: !!process.env.BAIDU_OCR_API_KEY,
            secret_key_configured: !!process.env.BAIDU_OCR_SECRET_KEY
        },
        node_env: process.env.NODE_ENV,
        timestamp: new Date().toISOString()
    });
});

// ===============================
// 用户管理 API（多用户支持）
// ===============================

// 获取所有用户列表
app.get('/api/users', async (req, res) => {
    try {
        const users = await db.getAllUsers();
        res.json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 获取特定用户信息
app.get('/api/users/:userId', async (req, res) => {
    try {
        const user = await db.getUser(req.params.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }
        
        // 检查 Xero 连接状态
        const xeroStatus = await xero.isConnected(req.params.userId);
        const xeroToken = await db.getXeroToken(req.params.userId);
        
        res.json({
            success: true,
            user: user,
            xero: {
                connected: xeroStatus,
                tenantName: xeroToken?.tenant_name || null,
                lastUpdated: xeroToken?.updated_at || null
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 获取所有已连接 Xero 的用户
app.get('/api/xero/users', async (req, res) => {
    try {
        const users = await db.getAllXeroUsers();
        res.json({
            success: true,
            count: users.length,
            users: users
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 断开用户 Xero 连接
app.post('/api/users/:userId/xero/disconnect', async (req, res) => {
    try {
        await xero.disconnect(req.params.userId);
        res.json({
            success: true,
            message: 'Xero connection removed'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ===============================
// 主页
// ===============================
app.get('/', (req, res) => {
    res.json({
        status: 'running',
        service: 'bizmate',
        timestamp: new Date().toISOString()
    });
});

// ===============================
// 飞书 Webhook 处理
// ===============================
app.post('/feishu-webhook', async (req, res) => {
    console.log('\n========== 收到请求 ==========');
    console.log('Time:', new Date().toISOString());
    console.log('Method:', req.method);
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Body type:', typeof req.body);
    console.log('Is Buffer:', Buffer.isBuffer(req.body));

    try {
        const body = parseBody(req);
        
        if (!body) {
            console.log('❌ 无法解析请求体');
            return res.status(400).json({ error: 'Invalid body' });
        }
        
        console.log('Parsed body keys:', Object.keys(body));
        console.log('Body type field:', body.type);
        console.log('Has header:', !!body.header);
        console.log('Has event:', !!body.event);
        
        // 调试：打印完整 body（用于排查图片消息问题）
        console.log('=== 完整请求体 ===');
        console.log(JSON.stringify(body, null, 2));
        console.log('==================');

        // 处理 URL 验证
        if (body.type === 'url_verification' && body.challenge) {
            console.log('✅ 处理 URL 验证');
            return res.json({ challenge: body.challenge });
        }

        // 处理事件回调
        if (body.header && body.event) {
            console.log('处理事件回调');
            const { header, event } = body;
            const eventType = header.event_type;

            if (!eventType || !eventType.includes('message')) {
                console.log('非消息事件，忽略。事件类型:', eventType);
                return res.json({ status: 'ignored' });
            }

            const messageId = event.message?.message_id;
            const chatId = event.message?.chat_id;
            const content = event.message?.content;
            const messageType = event.message?.message_type;
            const feishuUserId = event.sender?.sender_id?.open_id || chatId;
            
            // 调试：打印完整的消息结构
            console.log('=== 飞书消息结构 ===');
            console.log('event.message:', JSON.stringify(event.message, null, 2));
            console.log('event.sender:', JSON.stringify(event.sender, null, 2));
            console.log('===================');
            
            // 创建或更新用户（多用户支持）
            const userId = await db.createOrUpdateUser('feishu', feishuUserId, {
                name: event.sender?.sender_id?.union_id || null
            });
            
            if (!userId) {
                console.error('无法创建用户记录');
                return res.json({ status: 'error', message: 'User creation failed' });
            }

            // 防重复处理
            if (processedMessages.has(messageId)) {
                console.log('消息已处理，跳过:', messageId);
                return res.json({ status: 'duplicate' });
            }
            processedMessages.add(messageId);

            // 立即回复飞书（避免超时）
            res.json({ status: 'received' });
            console.log('✅ 已立即响应飞书，避免超时');

            // 后台异步处理
            (async () => {
                try {
                    console.log('开始后台处理...');
                    
                    const token = await getFeishuToken();
                    if (!token) {
                        console.error('无法获取飞书 token');
                        return;
                    }

                    // 处理图片消息（OCR识别发票）
                    console.log('消息类型:', messageType, '类型判断:', typeof messageType);
                    if (messageType === 'image') {
                        console.log('📷 收到图片消息，开始OCR识别...');
                        await handleImageMessage(chatId, userId, content, token);
                        return;
                    }

                    // 处理文本消息
                    if (messageType !== 'text') {
                        console.log('非文本/图片消息，忽略。类型:', messageType);
                        await sendFeishuMessage(chatId, '😊 抱歉，我目前只能处理文字和图片消息。\n\n📷 发送发票照片可自动识别并创建Xero发票\n💬 发送文字可查询财务数据', token);
                        return;
                    }

                    // 解析消息内容
                    let text = '';
                    try {
                        const parsed = JSON.parse(content);
                        text = parsed.text || '';
                    } catch {
                        text = content || '';
                    }

                    // 清理消息文本（去除引号）
                    text = text.replace(/^["']|["']$/g, '').trim();

                    if (!text) {
                        console.log('消息内容为空，忽略');
                        return;
                    }

                    console.log('用户消息:', text);

                    // 检查用户是否询问 OCR 状态
                    const lowerText = text.toLowerCase();
                    if (lowerText.includes('ocr') || lowerText.includes('识别') || lowerText.includes('拍照') || lowerText.includes('发票照片')) {
                        if (lowerText.includes('好了吗') || lowerText.includes('能用吗') || lowerText.includes('可用') || lowerText.includes('测试')) {
                            await sendFeishuMessage(chatId, 
                                `✅ **OCR 发票识别功能已启用！**\n\n` +
                                `🌐 使用 Google Cloud Vision API\n` +
                                `📷 **使用方法**：直接发送发票照片（不要发文字）\n` +
                                `🔄 **流程**：\n` +
                                `1. 发送发票照片\n` +
                                `2. 系统自动识别内容\n` +
                                `3. 您确认信息\n` +
                                `4. 自动创建 Xero 发票\n\n` +
                                `💡 **提示**：请确保照片清晰，包含完整的发票信息`, 
                                token
                            );
                            return;
                        }
                    }

                    // 检查是否有待确认的发票
                    const pendingInvoice = await ocr.getPendingInvoice(userId);
                    if (pendingInvoice) {
                        await handleInvoiceConfirmation(chatId, userId, text, pendingInvoice, token);
                        return;
                    }

                    // 发送"正在处理"提示
                    await sendFeishuMessage(chatId, '⏳ 正在思考...', token);

                    // 调用 AI 处理
                    const reply = await processUserMessage(userId, text);
                    console.log('AI 回复长度:', reply.length);

                    // 发送回复
                    if (reply && reply.trim()) {
                        await sendFeishuMessage(chatId, reply, token);
                    } else {
                        await sendFeishuMessage(chatId, '抱歉，我没有得到有效的回复，请重新提问。', token);
                    }
                    
                    console.log('✅ 完整处理完成');
                } catch (error) {
                    console.error('后台处理出错:', error.message);
                    console.error('错误堆栈:', error.stack);
                    
                    // 给用户友好的错误提示
                    try {
                        let errorMsg = '抱歉，处理您的请求时出现了问题，请稍后再试。\n\n错误详情: ' + error.message;
                        
                        if (error.message && error.message.includes('timeout')) {
                            errorMsg = '⏱️ 请求超时了，请稍后再试。';
                        } else if (error.message && error.message.includes('Not authenticated')) {
                            errorMsg = `🔑 **Xero 账户未连接**

请完成以下步骤：

1️⃣ 点击链接授权：
https://preconcessive-collene-unwrathful.ngrok-free.dev/xero/auth

2️⃣ 登录你的 Xero 账号

3️⃣ 授权 Bizmate 访问财务数据

4️⃣ 返回飞书继续对话

⚠️ 只需授权一次，之后数据会自动同步`;

                        }

                        const token = await getFeishuToken();
                        if (token) {
                            await sendFeishuMessage(chatId, errorMsg, token);
                        }
                    } catch (sendError) {
                        console.error('发送错误提示也失败了:', sendError.message);
                    }
                }
            })();
        } else {
            console.log('未知请求类型，返回 ok');
            res.json({ status: 'ok' });
        }
    } catch (error) {
        console.error('处理飞书消息出错:', error);
        res.status(500).json({ error: error.message });
    }
});

// 全局异常处理
process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('未处理的 Promise 拒绝:', reason);
});

// 启动服务器
app.listen(PORT, () => {
    console.log(`Bizmate 服务运行在端口 ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/feishu-webhook`);
    console.log(`Xero Auth: http://localhost:${PORT}/xero/auth`);
});
