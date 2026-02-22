# 部署到 Render 步骤

## 当前问题

API 检查发现 `srv-d6c8l3npm1nc73cd12mg` (xero-invoice-bot) 服务没有配置环境变量和 Disk。

但 `render.yaml` 中定义的是 `openclaw-feishu-bridge` 服务。

## 解决方案

### 方案 1: 更新现有服务 (推荐)

在 Render Dashboard 手动配置：

1. 访问 https://dashboard.render.com/web/srv-d6c8l3npm1nc73cd12mg

2. **设置环境变量**:
   ```
   FEISHU_APP_ID=cli_a9139fddafb89bb5
   FEISHU_APP_SECRET=BaChzUHA3iAPfddnIJ4T1eqvPqCMySPR
   MOONSHOT_API_KEY=sk-9ELqQcQuflGPjhVZYt8mAiQPf6KXvjjO2wdmzcTTyBdsEFp1
   XERO_CLIENT_ID=5C698D67083C405A89C46D4E73755EDB
   XERO_CLIENT_SECRET=5G2DT19U_uiG_8sehwC9R4P4s6ixmjQxiJD-qbd3yvddlIO9
   XERO_REDIRECT_URI=https://xero-invoice-bot.onrender.com/xero/callback
   PORT=10000
   RENDER_DISK_PATH=/data
   ```

3. **添加 Disk**:
   - Name: `bizmate-data`
   - Mount Path: `/data`
   - Size: 1 GB

4. **重新部署**:
   - 点击 "Manual Deploy" → "Deploy latest commit"

### 方案 2: 使用 Blueprint 部署新服务

1. 在 Render Dashboard 点击 "New +" → "Blueprint"

2. 连接 GitHub 仓库

3. Render 会读取 `render.yaml` 自动创建服务

4. 注意：这会创建新服务，需要更新飞书 Webhook URL

## 部署后验证

### 1. 检查服务状态
```bash
curl https://xero-invoice-bot.onrender.com/health
```

### 2. 检查 Xero 认证状态
```bash
curl https://xero-invoice-bot.onrender.com/xero/health
```

### 3. 如果需要重新授权
访问: https://xero-invoice-bot.onrender.com/xero/auth

### 4. 测试新功能
在飞书发送:
- "这个月要交多少税？"
- "最近资金紧不紧？"

## 本地代码已更新

新功能代码已准备好：
- ✅ BAS/GST 智能解读 (`getBASReport`)
- ✅ 现金流预测 (`getCashflowForecast`)
- ✅ Function Calling 工具注册
- ✅ System Prompt 更新

只需部署到 Render 即可使用！
