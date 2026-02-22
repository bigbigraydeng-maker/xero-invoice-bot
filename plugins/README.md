# Bizmate 插件系统

## 架构设计

Bizmate 采用插件化架构，每个业务系统封装为一个独立插件。

## 插件目录结构

```
plugins/
├── core/                    # 插件核心框架
│   ├── Plugin.js           # 插件基类
│   ├── PluginManager.js    # 插件管理器
│   └── index.js
├── xero/                    # Xero 财务插件
│   ├── index.js
│   ├── tools.js            # Function Calling 工具定义
│   ├── handlers.js         # 业务逻辑处理
│   └── config.js
├── hubspot/                 # HubSpot CRM 插件（规划中）
├── market-intel/            # 市场情报插件（规划中）
└── logistics/               # 物流追踪插件（规划中）
```

## 插件开发规范

### 1. 插件基类

```javascript
class Plugin {
  constructor(config) {
    this.name = config.name;
    this.version = config.version;
    this.enabled = config.enabled || false;
    this.tools = [];  // Function Calling 工具
    this.handlers = {};  // 意图处理器
  }

  // 初始化插件
  async init() {
    throw new Error('Plugin must implement init()');
  }

  // 获取插件状态
  async healthCheck() {
    return { status: 'unknown' };
  }

  // 处理用户意图
  async handleIntent(intent, params, context) {
    const handler = this.handlers[intent];
    if (handler) {
      return await handler(params, context);
    }
    return null;
  }
}
```

### 2. 插件注册

```javascript
// plugins/xero/index.js
const { Plugin } = require('../core');

class XeroPlugin extends Plugin {
  constructor() {
    super({
      name: 'xero',
      version: '1.0.0',
      description: 'Xero 财务系统集成'
    });
    
    this.tools = [
      {
        type: "function",
        function: {
          name: "get_receivables_summary",
          description: "获取应收账款汇总",
          parameters: { type: "object", properties: {} }
        }
      },
      // ... 更多工具
    ];
    
    this.handlers = {
      'query_receivables': this.queryReceivables.bind(this),
      'create_invoice': this.createInvoice.bind(this),
      // ... 更多处理器
    };
  }

  async init() {
    // 初始化 Xero 连接
  }

  async queryReceivables(params, context) {
    // 实现查询逻辑
  }
}

module.exports = XeroPlugin;
```

### 3. 意图识别映射

```javascript
// 意图 → 插件 → 处理器 映射
const INTENT_MAP = {
  'query_receivables': { plugin: 'xero', handler: 'query_receivables' },
  'create_invoice': { plugin: 'xero', handler: 'create_invoice' },
  'query_customers': { plugin: 'xero', handler: 'query_customers' },
  
  // 未来扩展
  'add_contact': { plugin: 'hubspot', handler: 'add_contact' },
  'track_shipment': { plugin: 'logistics', handler: 'track_shipment' },
  'market_analysis': { plugin: 'market-intel', handler: 'analyze_market' },
};
```

## 核心壁垒设计

### 1. 本地化层

```javascript
// core/localization/index.js
const LocalizationEngine = {
  // 税务规则
  taxRules: {
    'AU': require('./tax/au-gst'),
    'NZ': require('./tax/nz-gst'),
  },
  
  // 商业习惯
  businessCulture: {
    'chinese': require('./culture/chinese-business'),
  },
  
  // 合规检查
  compliance: {
    'AU': require('./compliance/au-standards'),
    'NZ': require('./compliance/nz-standards'),
  }
};
```

### 2. 智能编排层

```javascript
// core/orchestrator/index.js
class TaskOrchestrator {
  async processUserRequest(userMessage, context) {
    // 1. 意图识别
    const intent = await this.recognizeIntent(userMessage);
    
    // 2. 插件选择
    const plugin = this.selectPlugin(intent);
    
    // 3. 数据增强（本地化层）
    const enrichedContext = await this.enrichContext(context);
    
    // 4. 执行插件
    const result = await plugin.handleIntent(intent, params, enrichedContext);
    
    // 5. 结果格式化（本地化输出）
    return this.formatResult(result, context.locale);
  }
}
```

## 数据流

```
用户消息
   ↓
Bizmate AI 大脑
   ├── 意图识别
   ├── 实体提取
   └── 上下文管理
   ↓
插件调度器
   ├── 选择插件
   ├── 权限检查
   └── 数据转换
   ↓
插件执行
   ├── Xero API 调用
   ├── 数据处理
   └── 结果返回
   ↓
本地化层
   ├── 货币格式化
   ├── 税务计算
   └── 合规检查
   ↓
用户回复
```

## 未来插件规划

| 插件 | 优先级 | 功能 | 目标客户痛点 |
|------|--------|------|-------------|
| Xero | P0 | 财务自动化 | 不懂英文财务软件 |
| HubSpot | P1 | CRM管理 | 客户跟进混乱 |
| 市场情报 | P1 | 竞品监控 | 不了解市场动态 |
| 物流追踪 | P2 | 供应链可视化 | 货物状态不透明 |
| 人力资源 | P3 | 排班/工资 | 劳工法规复杂 |
| 营销自动化 | P3 | 微信营销 | 不会用英文营销工具 |
