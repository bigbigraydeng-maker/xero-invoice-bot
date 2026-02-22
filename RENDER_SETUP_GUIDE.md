# Render 手动配置指南

## 📊 当前状态

API 检查显示：
- ✅ **已有 7 个环境变量**（之前已配置）
- ✅ **部署已触发**（正在重新部署）
- ❌ API 更新返回 405（需要通过 Dashboard 修改）

## 🔧 需要检查的配置

### 1. 环境变量（已配置，但请确认）

访问：https://dashboard.render.com/web/srv-d6c8l3npm1nc73cd12mg/settings

确认以下变量已设置：
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

### 2. Disk 配置（需要确认）

访问：https://dashboard.render.com/web/srv-d6c8l3npm1nc73cd12mg/disks

确认 Disk 已创建：
- **Name**: `bizmate-data`
- **Mount Path**: `/data`
- **Size**: 1 GB

如果没有，点击 "Add Disk" 创建。

## 🚀 部署状态

部署已触发，请等待 2-3 分钟后检查：

### 检查服务状态
```bash
curl https://xero-invoice-bot.onrender.com/health
```

### 检查 Xero 认证状态
```bash
curl https://xero-invoice-bot.onrender.com/xero/health
```

## 🔑 如果需要重新授权

如果 `/xero/health` 返回 `not_authenticated`：

1. 访问：https://xero-invoice-bot.onrender.com/xero/auth
2. 登录 Xero 账号授权
3. Token 会自动保存到 `/data/tokens.json`

## ✅ 测试新功能

部署完成后，在飞书测试：

### 测试 1: BAS/GST 税务解读
```
用户：这个月要交多少税？
```

期望回复：
```
📊 BAS 税务报告（澳洲）

💰 本期应缴：$2,340.50
📅 截止日期：2026年3月28日（还剩12天）

📈 销售数据：...
📉 采购抵扣：...

💡 建议：...
```

### 测试 2: 现金流预测
```
用户：最近资金紧不紧？
```

期望回复：
```
💰 现金流预测（未来30天）

📊 当前状况：...
📈 未来30天预测：...

✅ 健康状态：健康
💡 建议：...
```

## 📝 代码更新摘要

本次部署包含以下新功能：

### xero.js 新增
- `getBASReport()` - BAS/GST 智能解读
- `getCashflowForecast()` - 现金流预测
- `generateGSTAdvice()` - GST 优化建议
- `generateCashflowInsight()` - 现金流洞察

### server.js 更新
- 新增 Function Calling 工具：`get_bas_report`, `get_cashflow_forecast`
- 更新 System Prompt，说明新功能用法

## 🆘 故障排除

### 问题 1: 部署失败
**解决**: 查看 Render Logs，检查是否有构建错误

### 问题 2: Xero 认证失败
**解决**: 访问 `/xero/auth` 重新授权

### 问题 3: 新功能无响应
**解决**: 
1. 检查日志中是否有错误
2. 确认环境变量 `XERO_*` 已设置
3. 确认 Disk 已挂载

### 问题 4: Token 刷新失败
**解决**: 
1. 检查 `XERO_CLIENT_ID` 和 `XERO_CLIENT_SECRET` 是否正确
2. 重新授权获取新 token

## 📞 需要帮助？

如果配置有问题，请提供：
1. Render Dashboard 截图（环境变量页面）
2. Render Logs 错误信息
3. 飞书测试对话截图
