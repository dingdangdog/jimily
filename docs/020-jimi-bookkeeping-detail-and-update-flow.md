# 020 — Jimi 记账详情与流水纠正

## 变更时间

2026-03-23

## 需求摘要

1. 记账成功后向客户端返回可展示的流水摘要，并在对话气泡中提供「查看详情」入口。
2. 用户紧接着纠正上一笔（例如补充「用支付宝支付」）时，助手应识别为修改流水，而非忽略工具调用。

## 实现说明

### 数据库

- `UserChatMessage` 增加可选字段 `meta`（JSON），用于持久化助手消息的扩展数据（如本次 `add_flow` / `update_flow` 成功后的流水摘要）。

### 后端

- `runChatAgent` 的 `ChatAgentResult` 增加 `assistantMeta`；在 JSON 方案与 tool_calls 方案中，当 `add_flow` 或 `update_flow` 成功时，从工具返回 JSON 构建 `flowBookkeeping` 结构。
- `runPersistedUserChat` 将 `assistantMeta` 写入新助手消息的 `meta`，并在 `GET .../messages` 中返回。
- `POST api/entry/ai/chat` 与 `POST api/v1/ai/chat` 在成功时附带 `assistantMeta`（与落库一致）。
- 新增工具 `update_flow` 与 `updateFlowByAI`：按 `flowId` 或名称关键字定位最近流水并部分更新；支持 `channelHint` 更换资金账户。
- 修正人设与路由提示：明确「支付宝/微信」应对应**资金账户**（`channelHint` / `accountId`），禁止以「无支付方式字段」为由拒绝处理；补充 `update_flow` 路由规则与规则兜底，扩展 `isLikelyToolIntent`。

### 前端

- `JimiChat.vue`：`ChatMessage` 支持 `meta`；助手气泡在存在 `flowBookkeeping` 时显示「查看详情」，弹窗展示条目、金额、分类、日期、资金账户等。

### 迁移

- 新增迁移目录 `20260323120000_user_chat_message_meta`（`ALTER TABLE ... ADD COLUMN IF NOT EXISTS meta JSONB`）。若本地与远程迁移历史不一致，请在目标库手动执行等价 SQL 或按团队流程对齐迁移。
