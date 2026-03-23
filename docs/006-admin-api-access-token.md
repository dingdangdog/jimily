# 006 — 管理员签发 API 访问令牌

> **说明：** 后续已改为全员自用签发与入口调整，实现细节以 **`007-api-token-self-service-and-test-script.md`** 为准；下文保留初版设计记录。

## 日期

2026-03-23

## 需求摘要

- 管理员可为指定用户生成用于自行调用 API 的 JWT（如 `Authorization: Bearer`）。
- 有效期可选：30 天、360 天、无限期（JWT 不含 `exp`）。
- 不得影响原有网页登录（不写 `Authorization` Cookie）。

## 实现说明

1. **`server/utils/api-access-token.ts`**  
   统一签发逻辑：payload 与登录一致（`id`、`username`、`name`、`email`、`roles`），并增加 `typ: "api_access"` 便于区分；`forever` 时不传 `expiresIn`。

2. **`server/api/admin/api-tokens/issue.post.ts`**  
   管理员接口：`POST` body `{ userId, expiry: "30d" | "360d" | "forever" }`，仅 JSON 返回 `token` 与 `expiresAt`（无限期为 `null`），不调用 `setCookie`。

3. **管理端页面 `app/pages/admin/api-tokens/`**  
   选择用户与有效期后生成令牌，支持复制；侧栏增加「API 访问令牌」入口。

## 验证方式

- ~~管理员登录后打开 `/admin/api-tokens`~~（已调整，见 `007-api-token-self-service-and-test-script.md`）。
- 使用 `curl` 或 `scripts/test-api-token.mjs` 携带 `Authorization: Bearer <token>` 请求 `/api/entry/user/info` 等接口应返回 `c === 200`。
