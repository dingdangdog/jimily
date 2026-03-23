# Jimi：批量添加资金账户自然语言修复（2026-03-23）

## 现象

用户输入类似「添加微信、支付宝、银行卡、现金这几个资金账户」时，助手回复称需要「更明确的账户名称」、建议一个一个添加。

## 原因

1. **JSON 路由兜底规则缺失**：`routeByRules` 未识别「批量添加资金账户」类语句，路由失败时落到 `action: none` 或模型误选工具。
2. **误选 `add_fund_account` 且缺 `name`**：工具返回 `success: false` /「账户名称不能为空」，摘要模型据此生成「名称不够明确」类话术。
3. **路由器说明不足**：未强调多账户必须走 `batch_add_fund_accounts`，且短名称合法。

## 改动

- 在 `server/lib/ai/chat-agent.ts` 中：
  - 为路由器补充 `batch_add_fund_accounts` / `add_fund_account` 的专用原则（短名称合法、多账户必须用批量工具）。
  - 新增 `extractBatchFundAccountNamesFromUserText`，从用户原文解析顿号/逗号分隔的账户名。
  - `applyTemporalHints` 对批量/单账户添加工具自动补全 `accountNames` / `name`。
  - `runWithJsonPlan` 在 `add_fund_account` 无 `name` 但解析出多个名称时，自动改为 `batch_add_fund_accounts`。
  - `routeByRules` 增加「添加/新增…资金账户 + 含微信/支付宝等」时的批量添加兜底。
- 在 `server/lib/ai/tools.ts` 中强化函数描述，引导多账户走批量工具并认可短名称。

## 验证建议

在 Jimi 中发送：「添加微信、支付宝、银行卡、现金这几个资金账户」，应调用 `batch_add_fund_accounts` 并成功创建或跳过已存在项，回复中说明新增/跳过数量。
