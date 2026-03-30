# 035：用户聊天消息记录发送时所用模型快照

## 变更说明

为 `UserChatMessage`（用户侧 Jimi 对话消息）增加与「本条用户消息发送时」一致的模型/服务商快照字段，便于历史展示与导出对照。

## 数据库

- `usedProviderId`：选用的系统 AI 服务商 ID（与 `SystemAIProvider.id` 对应；走环境变量直连 OpenAI 时为 `null`）。
- `usedProviderName`：服务商显示名快照。
- `usedApiModel`：实际请求的 API 模型名快照（与 `getAIProviderConfig` 中生效的模型一致；库内服务商若未填 `apiModel` 则与运行时一致回退为 `gpt-4o-mini`）。

迁移：`prisma/migrations/20260330120000_user_chat_message_used_model/migration.sql`。

## 服务端

- `server/lib/ai/client.ts`：`getChatProviderSnapshot(providerId?)`，与 `getAIClient` / `getAIProviderConfig` 同源解析服务商。
- `server/lib/ai/user-chat-service.ts`：创建 `role: user` 消息时写入上述三字段；`listUserChatMessages` 的 `select` 包含这三列以便 API 返回。

## 前端

- `app/components/jimi/JimiChat.vue`：`ChatMessage` 类型补充可选字段；用户气泡下方弱样式展示「服务商名 · API 模型」；导出 Markdown 时在对应用户段落追加「发送时模型」行。

## 部署注意

部署需执行 `pnpm exec prisma migrate deploy`（或等价迁移流程），并确保已 `prisma generate`。
