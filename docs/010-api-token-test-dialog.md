# 010 — 令牌页内「测试令牌」弹窗

## 日期

2026-03-23

## 说明

在 `app/pages/user/api-tokens.client.vue` 增加「测试令牌」按钮，弹出对话框：可粘贴 JWT，点击「执行测试」后调用 `app/utils/api-token-test.ts` 中的 `runApiTokenTestSuite`（与 `scripts/test-api-token.mjs` 相同的两类请求：`GET /api/entry/user/info`、`GET /api/admin/config/get`），使用 `fetch` + `Authorization: Bearer` + `credentials: 'omit'`，避免带上浏览器 Cookie，单独验证所填 Token。

支持「填入刚生成的令牌」、ESC 关闭弹窗（`useEscapeKey`）。
