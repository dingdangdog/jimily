# 026 — server 认证中间件：严格前缀与按需校验 JWT

## 变更时间

2026-03-30

## 文件

- `server/middleware/auth.ts`

## 说明

- **路径匹配**：由 `startsWith("/api/v1")` 等改为「等于 base 或以 `base/` 开头」，避免误包含 `/api/v10`、`/api/entrypoint`、`/api/administrator` 等。
- **性能**：仅在命中 `/api/entry`、`/api/v1`、`/api/admin` 时再调用 `getAuthPayload`。
- **OPTIONS**：预检请求直接放行。
- **管理员登录**：产品侧统一走 `/api/login`（见 `app/pages/login.vue`），中间件**不**为 `/api/admin/login` 单独放行；若仍保留该服务端文件，其行为与「未单独使用」的设计一致。
