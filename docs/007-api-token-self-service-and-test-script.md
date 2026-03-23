# 007 — API 访问令牌改为全员自用 + 测试脚本

## 日期

2026-03-23

## 变更说明

1. **签发接口** 从 `/api/admin/api-tokens/issue` 迁至 **`POST /api/entry/user/api-token/issue`**，走与普通业务相同的 JWT 校验；**仅能为当前登录用户**签发（忽略他人 `userId`，若传入与当前用户不一致则报错）。
2. **前端** 页面由 `/admin/api-tokens` 改为 **`/user/api-tokens`**，使用 `middleware: ["auth"]`，侧栏入口移至普通用户菜单。
3. **测试脚本** `scripts/test-api-token.mjs`：填入或传入 Token 后请求 `GET /api/entry/user/info`，根据 HTTP 与业务字段 `c === 200` 判断有效性。

## 测试命令示例

```bash
# Windows PowerShell
$env:API_TOKEN="粘贴你的JWT"
$env:BASE_URL="http://127.0.0.1:3000"
node scripts/test-api-token.mjs
```

或在脚本内修改 `DEFAULT_TOKEN` / `DEFAULT_BASE_URL` 后直接 `node scripts/test-api-token.mjs`。

也可在项目根执行 `npm run test-api-token`（仍需通过环境变量或参数提供 Token）。
