# 013 — OpenAPI 服务器地址与 AI v1 文档补全

## 变更说明

1. **`swagger.config.ts` 的 `servers[0].url`**  
   由 `http://localhost:9090/api` 改为 `http://localhost:9090`。  
   原因：各接口在 `@swagger` 中的路径已以 `/api/...` 开头，再叠加 `/api` 会导致文档与 Scalar 中展示的完整 URL 出现 `/api/api/...`。

2. **`server/api/v1/ai/**`**  
   为 `chat`、`conversations` 的 GET/POST 及 `conversations/{id}` 的 GET/PATCH/DELETE、`conversations/{id}/messages` 的 GET 补充 `@swagger` 块，`tags` 统一为 **AI v1**，与现有 `Authorization: []` 鉴权写法保持一致。

## 验证建议

- 启动 `pnpm dev` 后打开 `/api-docs`，任选一个历史接口，确认示例完整 URL 为 `http://localhost:9090/api/...`（仅一段 `/api`）。  
- 侧栏出现 **AI v1** 分组，且上述 7 个操作均已列出。
