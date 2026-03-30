# 032 — Jimi「重试」复用 clientRequestId：解决超时误判后的重复记账

## 变更时间

2026-03-30

## 问题说明

此前仅在内存中对 `clientRequestId` 做短时去重；**「重试」** 每次生成新的 UUID，因此典型场景下无效：

1. 用户发送消息，服务端已落库用户消息并完成 AI/记账；
2. 前端超时或报错，用户点击该条用户消息的 **「重试」**；
3. 新请求携带 **新** id → 服务端再走一轮 → **重复记账**。

## 方案

1. **数据库** `user_chat_messages` 增加可空字段 `clientRequestId`（VARCHAR 80），并建立唯一约束 `(sessionId, clientRequestId)`（PostgreSQL 下多条 `clientRequestId IS NULL` 仍允许）。
2. **写入**：持久化对话在插入用户消息时写入 `clientRequestId`（若请求携带）。
3. **读取**：会话消息列表 API 返回 `clientRequestId`，供前端展示层绑定到 `ChatMessage`。
4. **服务端 `executePersistedUserChat`**
   - 若已存在同会话、同 `clientRequestId` 的用户消息，且其后已有助手消息：**直接返回该轮结果**（不再调模型、不再写用户行）。
   - 若仅有用户消息、尚无助手消息：**仅补跑 AI 并写助手消息**（适用于进程崩溃等极少见情况）。
   - 并发插入冲突（`P2002`）：走上述「已存在用户行」分支。
5. **前端 `JimiChat.vue`**
   - 乐观用户气泡携带 `clientRequestId`；
   - **「重试」** 若当前消息已有 `clientRequestId`（来自服务端列表），则 **复用** 该 id；无 id 的旧数据仍生成新 id（等价新轮次）。
6. **内存幂等 TTL** 延长至 24 小时，与 DB 回放互补。

## 部署注意

需执行迁移：`prisma/migrations/20260330103000_user_chat_message_client_request_id`。

## 修正（见 033）

网页 Jimi 的 **「重试」** 不再复用消息上的 `clientRequestId`，每次重试均为**新的一轮**，以满足「相同话术再次记账」等产品需求。库内与内存幂等仍保留给并发、API 等场景。

## 仍存在的边界

- 多标签各发相同文案但不同 id，仍可能重复。
