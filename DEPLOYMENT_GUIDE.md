# Bizmate 部署指南

## 🚀 快速部署到 Render

### 步骤 1: 创建 Render 服务

1. 登录 [Render Dashboard](https://dashboard.render.com)
2. 点击 **New +** → **Web Service**
3. 选择 GitHub 仓库: `bigbigraydeng-maker/xero-invoice-bot`
4. 配置:
   - **Name**: `xero-invoice-bot`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### 步骤 2: 配置环境变量

在 Render Dashboard → Settings → Environment 中添加:

```bash
# Xero API
XERO_CLIENT_ID=your_xero_client_id
XERO_CLIENT_SECRET=your_xero_client_secret
XERO_REDIRECT_URI=https://xero-invoice-bot.onrender.com/xero/callback

# Feishu
FEISHU_APP_ID=your_feishu_app_id
FEISHU_APP_SECRET=your_feishu_app_secret

# AI
MOONSHOT_API_KEY=your_moonshot_api_key

# Render Disk
RENDER_DISK_PATH=/data
```

### 步骤 3: 添加 Disk 存储

1. 进入 Render Dashboard → Disks
2. 点击 **Add Disk**
3. 配置:
   - **Name**: `bizmate-data`
   - **Mount Path**: `/data`
   - **Size**: 1 GB

### 步骤 4: Xero 授权

1. 访问 `https://xero-invoice-bot.onrender.com/xero/auth`
2. 登录 Xero 账户
3. 选择组织并授权所有权限
4. 授权成功后，token 会自动保存到 `/data/tokens.json`

### 步骤 5: 配置飞书 Webhook

1. 登录 [飞书开发者平台](https://open.feishu.cn)
2. 进入你的应用 → 事件订阅
3. 设置请求地址:
   ```
   https://xero-invoice-bot.onrender.com/feishu-webhook
   ```
4. 点击"验证"，应该能成功

## ✅ 验证部署

### 检查服务状态
```bash
curl https://xero-invoice-bot.onrender.com/health
```

### 检查 Xero 认证
```bash
curl https://xero-invoice-bot.onrender.com/xero/auth
```

### 测试飞书机器人
在飞书中@机器人，发送"查询应收账款"

## 🔧 故障排查

### 问题 1: 401 Unauthorized
**原因**: Xero Token 过期
**解决**: 重新访问 `/xero/auth` 授权

### 问题 2: Webhook 验证失败
**原因**: URL 配置错误或权限不足
**解决**: 
- 确认 URL 正确
- 检查飞书应用权限

### 问题 3: Token 文件写入失败
**原因**: Disk 未正确挂载
**解决**: 检查 Disk 配置，确保 Mount Path 为 `/data`

## 📋 维护事项

### 定期重新授权
Xero Refresh Token 60 天过期，建议每 30 天重新授权一次:
```
https://xero-invoice-bot.onrender.com/xero/auth
```

### 监控 Token 状态
访问 `/health` 端点查看 token 状态和剩余有效期。

## 📝 更新部署

代码更新后自动部署:
```bash
git add -A
git commit -m "Your changes"
git push origin main
```

Render 会自动检测并重新部署。
