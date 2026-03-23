# 004 — Jimi 记账助手对话优化

## 变更时间

2025-03-23

## 背景与目标

- 明确助手身份：名称为 Jimi，专注个人记账场景。
- 在保持任务导向的前提下，回复略带温和、简短的人类语气；非记账闲聊不展开。
- 提升结构化解析质量：典型如「早晚公交车各 2 元」应得到合计金额与合理分类（如「交通」），避免默认「其他」；产品已移除流水支付方式字段，回复与提示中不再引导模型谈论支付方式。

## 代码改动摘要

1. **`server/lib/ai/client.ts`**  
   - 新增 `CHAT_AGENT_DIALOG_TEMPERATURE_CAP`、`CHAT_AGENT_ROUTER_TEMPERATURE`、`CHAT_AGENT_SUMMARY_TEMPERATURE`。  
   - 新增 `clampDialogTemperature`，用于对话轮次在不过度提高随机性的前提下尊重较低的用户配置。

2. **`server/lib/ai/chat-agent.ts`**  
   - 用 `JIMI_IDENTITY_BLOCK` 与扩展后的 `SYSTEM_PROMPT` 描述人设、分类映射、金额合并规则、非记账边界及禁止编造支付方式。  
   - `ROUTER_SYSTEM_PROMPT` 补充 `add_flow` 的金额与 `industryType` 规则及 `none` 时的简短温和引导。  
   - 工具调用路径使用 `clampDialogTemperature`；路由与摘要使用统一温度常量。  
   - 摘要 system 提示与 `add_flow` 降级文案体现分类、账户信息且不提支付方式。

3. **`server/lib/ai/tools.ts`**  
   - 细化 `add_flow` 的 `industryType`、`channelHint` 字段说明，强调类目推断与「渠道词仅用于匹配账户」。

## 使用说明

模型行为主要依赖上述提示与工具 schema；若数据库里为服务商配置了较低 `temperature`，仍会保留；若配置较高，对话轮次会被上限钳制，以利于分类与数字稳定性。
