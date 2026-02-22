# Bizmate - Xero 智能财务助手

Bizmate 是一个集成 Xero 会计软件和飞书（Feishu）的智能财务助手，提供中文对话式财务管理体验。

## 🚀 功能特性

### 📊 财务查询
- **应收账款** - 查询客户欠款情况
- **客户发票** - 查看指定客户的历史发票
- **发票列表** - 获取所有发票记录
- **客户管理** - 查看和管理客户信息

### 💰 税务报告
- **BAS/GST 报告** - 自动识别澳洲/新西兰税务，中文解读税务数据
- **税务优化建议** - 智能分析并提供节税建议

### 📈 现金流预测
- **资金预测** - 分析未来30天资金流入流出
- **风险预警** - 提前预警资金缺口

### 📝 发票管理
- **创建发票** - 快速为客户创建新发票
- **OCR 识别** - 拍照识别发票信息并自动创建

## 🛠️ 技术栈

- **后端**: Node.js + Express
- **AI**: Moonshot AI (Kimi)
- **会计**: Xero API
- **消息**: 飞书 (Feishu)
- **部署**: Render

## 📋 环境变量

```env
# Xero API
XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_REDIRECT_URI=https://your-service.onrender.com/xero/callback

# Feishu
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret

# AI
MOONSHOT_API_KEY=your_moonshot_api_key

# Render Disk (可选)
RENDER_DISK_PATH=/data
```

## 🚀 部署指南

### 1. 创建 Render 服务
1. 登录 [Render](https://render.com)
2. 创建新的 Web Service
3. 连接 GitHub 仓库

### 2. 配置环境变量
在 Render Dashboard 中设置所有必需的环境变量

### 3. 添加 Disk（用于存储 Token）
- Mount Path: `/data`
- Size: 1GB

### 4. Xero 授权
访问 `https://your-service.onrender.com/xero/auth` 完成授权

### 5. 配置飞书 Webhook
在飞书开发者平台设置 Webhook URL:
```
https://your-service.onrender.com/feishu-webhook
```

## 🔧 本地开发

```bash
# 安装依赖
npm install

# 创建 .env 文件
cp .env.example .env
# 编辑 .env 填入你的配置

# 启动服务
npm start
```

## 📖 使用示例

在飞书中@机器人，发送以下指令：

- "查询应收账款" - 查看客户欠款
- "交多少税" - 获取 BAS/GST 报告
- "现金流预测" - 查看资金预测
- "创建发票 ABC公司 1000 设计服务费" - 创建新发票

## 🔐 Token 管理

Xero Token 有效期：
- **Access Token**: 30 分钟（自动刷新）
- **Refresh Token**: 60 天（需定期重新授权）

服务会自动刷新 access token，但每 60 天需要重新授权一次。

## 📝 项目结构

```
.
├── server.js          # 主服务入口
├── xero.js            # Xero API 集成
├── ocr.js             # OCR 功能
├── ocr-unified.js     # 统一 OCR 接口
├── package.json       # 项目配置
├── render.yaml        # Render 部署配置
└── data/              # Token 存储目录
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
