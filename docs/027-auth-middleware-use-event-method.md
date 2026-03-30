# 027 — 认证中间件：用 event.method 替代弃用的 getMethod

## 变更时间

2026-03-30

## 文件

- `server/middleware/auth.ts`

## 说明

H3 中 `getMethod(event, ...)` 的该签名为 deprecated；对 HTTP 方法应使用 `event.method`（与 Events API 一致），行为等价，仅消除类型/弃用提示。
