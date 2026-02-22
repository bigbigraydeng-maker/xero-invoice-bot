# Bizmate 项目清理计划

## 📁 文件分类

### ✅ 核心文件（保留）
- `server.js` - 主服务
- `xero.js` - Xero API 集成
- `ocr.js` - OCR 功能
- `ocr-unified.js` - 统一 OCR 接口
- `package.json` - Node.js 依赖
- `package-lock.json` - 锁定依赖版本
- `.env` - 环境变量（不提交到 Git）
- `.gitignore` - Git 忽略配置
- `render.yaml` - Render 部署配置
- `Procfile` - Render 进程配置
- `requirements.txt` - Python 依赖（Render 兼容）

### 📖 文档（保留）
- `README.md` - 项目说明
- `RENDER_SETUP_GUIDE.md` - Render 部署指南
- `deploy-to-render.md` - 部署文档
- `deploy-checklist.md` - 部署检查清单

### 🧪 测试/调试文件（删除）
所有 `test-*.js`, `check-*.js`, `fix-*.js`, `setup-*.js`, `monitor-*.js` 等临时脚本

### 🪟 Batch 脚本（删除）
所有 `*.bat` 文件

### 📦 数据（保留但忽略）
- `data/` 目录（包含 tokens.json）
- `node_modules/` 目录（已在 .gitignore）

---

## 🗑️ 删除命令

```bash
# 删除测试脚本
rm test-*.js check-*.js fix-*.js setup-*.js monitor-*.js update-*.js verify-*.js get-*.js create-*.js trigger-*.js

# 删除 batch 脚本
rm *.bat

# 删除旧文档（保留核心文档）
rm deploy-checklist.md deploy-to-render.md
```

---

## 🔧 Render 服务

### 旧服务（删除）
- `xero-invoice-bot` - 旧的 Python 服务

### 新服务（保留）
- `xero-invoice-bot-1` - 当前 Node.js 服务

---

## 📝 后续优化

1. 重命名服务 `xero-invoice-bot-1` → `xero-invoice-bot`
2. 更新飞书 webhook URL
3. 更新 Xero 开发者后台的 Redirect URI
