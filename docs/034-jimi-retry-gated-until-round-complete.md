# 034 — Jimi「重试」：本轮未结束时禁用，结束后可用

## 变更时间

2026-03-30

## 需求

在**不**把「重试」绑回幂等 id 的前提下，减少「上一轮还在等回复就再点重试」导致的重复记账：

- 该条用户消息下方**尚未出现助手消息**（成功或「对话失败」均算**已结束**）且当前列表**末尾正是该条**、且 **`sending`** 表示仍有请求进行中 → **禁用**该条「重试」。
- 一旦该条下方已有助手气泡 → 视为本轮**已明确结束**，允许「重试」再开**新的一轮**（仍使用新的 `clientRequestId`）。
- 任意 **`sending`** 期间禁用**所有**「重试」，避免与正在发送的请求并发。

## 实现（`JimiChat.vue`）

- `userTurnHasAssistantReply(index)`：`messages[index + 1]?.role === "assistant"`。
- `canRetryUserMessage(index)`：综合 `sending`、是否已有助手回复、末尾卡住（无助手但非 sending）等分支。
- `userMessageRetryTitle(index)`：禁用时的 `title` 说明原因。
- `retryWithMessage(msg, index)` 入口再次校验 `canRetryUserMessage`。

## 局限

- 依赖消息顺序为「用户 → 助手」交替；若数据异常（中间缺助手），中间条目的「重试」会保持禁用，需输入框或刷新。
