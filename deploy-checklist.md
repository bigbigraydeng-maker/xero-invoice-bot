# Bizmate 部署检查清单

## Render 部署状态

### 1. Disk 配置 ✅
- Mount 路径: `/data`
- 环境变量 `RENDER_DISK_PATH`: `/data`
- Token 文件路径: `/data/tokens.json`

### 2. 环境变量配置 ✅
- `FEISHU_APP_ID`: 已配置
- `FEISHU_APP_SECRET`: 已配置
- `MOONSHOT_API_KEY`: 已配置
- `XERO_CLIENT_ID`: 需要在 Render Dashboard 设置
- `XERO_CLIENT_SECRET`: 需要在 Render Dashboard 设置
- `XERO_REDIRECT_URI`: 需要在 Render Dashboard 设置
- `PORT`: 10000
- `RENDER_DISK_PATH`: /data

### 3. 新功能代码 ✅
- `getBASReport()` - BAS/GST 智能解读
- `getCashflowForecast()` - 现金流预测
- Function Calling 工具已注册
- System Prompt 已更新

## 部署步骤

### 步骤 1: 确保 Render 环境变量完整
在 Render Dashboard → Environment 中设置：
```
XERO_CLIENT_ID=5C698D67083C405A89C46D4E73755EDB
XERO_SECRET=5G2DT19U_uiG_8sehwC9R4P4s6ixmjQxiJD-qbd3yvddlIO9
XERO_REDIRECT_URI=https://your-service.onrender.com/xero/callback
```

### 步骤 2: 检查 Render Disk 中的 token
访问: `https://your-service.onrender.com/xero/health`

期望返回:
```json
{
  "status": "authenticated",
  "tenant_id": "xxx"
}
```

如果返回 `not_authenticated`，需要在 Render 上重新授权：
1. 访问 `https://your-service.onrender.com/xero/auth`
2. 登录 Xero 授权
3. 回调后会保存 token 到 `/data/tokens.json`

### 步骤 3: 测试新功能
在飞书上测试：
- "这个月要交多少税？" → 触发 BAS/GST 报告
- "最近资金紧不紧？" → 触发现金流预测

## 自动刷新机制

代码已实现自动刷新：
```javascript
async function getValidToken() {
  // 1. 尝试使用现有 token
  // 2. 如果 401，用 refresh token 获取新 token
  // 3. 保存新 token 到 /data/tokens.json
  // 4. 返回新 token
}
```

只要 Refresh Token 有效，系统会自动维护，无需人工干预。

## 常见问题

### Q: 什么时候需要重新授权？
A: 只有以下情况需要：
- 首次部署（没有 token）
- Refresh Token 过期（90天未使用）
- 更换 Xero App（Client ID 变了）
- 用户手动撤销授权

### Q: 如何确认 token 自动刷新正常工作？
A: 
1. 查看 Render Logs，搜索 "Token 刷新成功"
2. 检查 `/data/tokens.json` 的修改时间
3. 长时间运行后（>30分钟）测试功能是否正常

### Q: 本地开发和 Render 环境的区别？
A:
| 环境 | Token 路径 | 说明 |
|------|-----------|------|
| 本地 | `./data/tokens.json` | 本地测试用 |
| Render | `/data/tokens.json` | 生产环境，Disk 持久化 |

两个环境的 token 不互通，需要分别授权。
