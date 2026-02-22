require('dotenv').config();

const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const xero = require('./xero');
const ocr = require('./ocr-unified');

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
9. 发票识别 - 拍照自动识别发票并创建账单

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
    }
];

// 对话历史管理（内存 Map，按用户隔离）
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 20;

function getHistory(userId) {
    return conversationHistory.get(userId) || [];
}

function saveHistory(userId, userMsg, assistantMsg) {
    const history = getHistory(userId);
    history.push({ role: 'user', content: userMsg });
    history.push({ role: 'assistant', content: assistantMsg });
    if (history.length > MAX_HISTORY_LENGTH) {
        history.splice(0, history.length - MAX_HISTORY_LENGTH);
    }
    conversationHistory.set(userId, history);
}

// 工具执行器
async function executeToolCall(toolCall) {
    const { name, arguments: argsStr } = toolCall.function;
    const args = JSON.parse(argsStr || '{}');

    console.log(`执行工具: ${name}`, args);

    try {
        switch (name) {
            case 'get_customer_invoices':
                return await xero.getCustomerInvoices(args.customer_name);
            case 'get_receivables_summary':
                return await xero.getReceivablesSummary();
            case 'get_all_invoices':
                return await xero.getAllInvoices();
            case 'get_all_customers':
                return await xero.getAllCustomers();
            case 'create_invoice':
                return await xero.createInvoice(args);
            case 'get_bas_report':
                return await xero.getBASReport();
            case 'get_cashflow_forecast':
                return await xero.getCashflowForecast(args.days || 30);
            default:
                return { error: `未知工具: ${name}` };
        }
    } catch (error) {
        console.error(`工具执行失败 ${name}:`, error.message);
        return { error: error.message };
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
        const history = getHistory(userId);
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
        saveHistory(userId, userText, reply);
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
        console.log('获取飞书 access token...');
        const response = await axios.post('https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal', {
            app_id: FEISHU_APP_ID,
            app_secret: FEISHU_APP_SECRET
        });

        if (response.data && response.data.app_access_token) {
            cachedFeishuToken = response.data.app_access_token;
            // token 有效期通常是 2 小时，这里设置 1.5 小时后过期
            tokenExpiry = Date.now() + (90 * 60 * 1000);
            console.log('飞书 token 获取成功');
            return cachedFeishuToken;
        }
    } catch (error) {
        console.error('获取飞书 token 失败:', error.message);
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
        ocr.storePendingInvoice(userId, invoiceData);

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
        console.log('下载飞书图片:', imageKey);
        
        // 获取图片下载链接
        const response = await axios.get(
            `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`,
            {
                headers: { 'Authorization': `Bearer ${token}` },
                responseType: 'arraybuffer',
                timeout: 30000
            }
        );

        if (response.data) {
            // 转换为 base64
            const base64 = Buffer.from(response.data).toString('base64');
            console.log('图片下载成功，大小:', response.data.length, 'bytes');
            return base64;
        }
    } catch (error) {
        console.error('下载飞书图片失败:', error.message);
        if (error.response) {
            console.error('HTTP状态:', error.response.status);
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
            const result = await xero.createInvoice(xeroInvoice);
            
            // 清除待确认状态
            ocr.clearPendingInvoice(userId);

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
        ocr.clearPendingInvoice(userId);
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
// Xero OAuth 路由
// ===============================
app.get('/xero/auth', (req, res) => {
    const authUrl = xero.getAuthUrl();
    res.redirect(authUrl);
});

app.get('/xero/callback', async (req, res) => {
    const code = req.query.code;
    const error = req.query.error;
    const errorDescription = req.query.error_description;
    
    // 记录完整的查询参数，用于调试
    console.log('Xero callback received:', {
        query: req.query,
        code: code ? 'present' : 'missing',
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
    
    if (!code) {
        return res.status(400).json({ 
            error: 'No code received from Xero',
            query_params: req.query 
        });
    }

    try {
        await xero.handleCallback(code);
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
// 健康检查
// ===============================
app.get('/health', async (req, res) => {
    const xeroStatus = await xero.healthCheck();
    const ocrStatus = ocr.getOCRStatus();
    res.json({
        status: 'running',
        service: 'bizmate',
        xero: xeroStatus,
        ocr: ocrStatus,
        timestamp: new Date().toISOString()
    });
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
            const userId = event.sender?.sender_id?.open_id || chatId;

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

                    // 检查是否有待确认的发票
                    const pendingInvoice = ocr.getPendingInvoice(userId);
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

// 初始化 Xero 模块
xero.initXero();

// 启动服务器
app.listen(PORT, () => {
    console.log(`Bizmate 服务运行在端口 ${PORT}`);
    console.log(`Webhook URL: http://localhost:${PORT}/feishu-webhook`);
    console.log(`Xero Auth: http://localhost:${PORT}/xero/auth`);
});
