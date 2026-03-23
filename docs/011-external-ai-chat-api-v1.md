# 011 — 外部集成：AI 对话 v1 API 与会话服务抽取

## 变更说明（按时间顺序）

1. **抽取 `server/lib/ai/user-chat-service.ts`**  
   将用户 AI 会话的列表、创建、查询、改标题、删除、拉取消息以及「持久化单轮对话（写用户消息 → 调 `runChatAgent` → 写助手消息）」集中到同一服务层，供网页端 `/api/entry/ai/*` 与对外 v1 路由复用，避免重复 Prisma 与错误处理逻辑。

2. **重构现有入口**  
   - `server/api/entry/ai/chat.post.ts` 改为调用 `runPersistedUserChat`。  
   - `sessions.get/post`、`sessions/[id]/messages.get`、`index.delete`、`index.patch` 改为调用上述服务函数。  
   - `POST /api/entry/ai/sessions` 支持可选请求体 `{ title?: string }`（不传则仍为「新对话」）。

3. **新增对外 REST 风格路径 `/api/v1/ai/*`**（与网页会话同源数据，鉴权方式相同：`Authorization: Bearer` 用户 API 令牌或 Cookie 登录）  
   - `GET /api/v1/ai/conversations` → `d.conversations`  
   - `POST /api/v1/ai/conversations` → `d.conversation`（可选 `{ title }`）  
   - `GET /api/v1/ai/conversations/:id` → `d.conversation`  
   - `PATCH /api/v1/ai/conversations/:id` → `d.conversation`（`{ title }`）  
   - `DELETE /api/v1/ai/conversations/:id` → `d.ok`、`d.conversationId`  
   - `GET /api/v1/ai/conversations/:id/messages` → `d.messages`、`d.conversationId`  
   - `POST /api/v1/ai/chat` → 见下文

4. **`POST /api/v1/ai/chat` 行为**  
   - 请求体：`content`（必填）、`conversationId` 可选；**不传或 ID 无效/非本人会话时自动新建对话**（与原先 `/api/entry/ai/chat` 不传 `sessionId` 一致）。  
   - 兼容别名字段 `sessionId`（与网页端一致）。  
   - 可选 `providerId`（与 entry 一致）。  
   - 成功：`d` 含 `content`、`conversationId`、`conversation`（含 `id/title/createdAt/updatedAt`），便于外部程序首轮即可持久化对话 ID。  
   - AI 失败：业务仍为 `c=500`，`d` 中同样携带 `conversationId`、`content`（失败说明文案）、`conversation`。

5. **令牌测试**  
   `app/utils/api-token-test.ts` 与 `scripts/test-api-token.mjs` 增加对 `GET /api/v1/ai/conversations` 的探测；API 令牌页「测试令牌」弹窗同步展示该请求结果。

## 兼容说明

- 网页与已有脚本可继续使用 `/api/entry/ai/chat`（`sessionId`）及 `/api/entry/ai/sessions/*`，行为与数据与 v1 一致。  
- 模型与提供商列表仍可使用现有 `GET /api/entry/ai/providers`（未另做 v1 别名，避免重复维护）。

## 响应信封

与全站一致：`{ c, m, d }`，成功 `c=200`。
