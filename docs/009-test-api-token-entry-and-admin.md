# 009 — 测试脚本区分普通接口与管理员接口

## 日期

2026-03-23

## 说明

`scripts/test-api-token.mjs` 依次请求：

| 类型 | 方法路径 | 期望 |
|------|-----------|------|
| 普通用户 | `GET /api/entry/user/info` | 有效用户 Token：`c === 200` |
| 管理员 | `GET /api/admin/config/get` | 含 `admin` 角色：`c === 200`；否则多为 `c === 400` 且提示需要管理员权限 |

脚本会打印各请求的 HTTP 状态、响应体及汇总结论；若普通用户接口未通过则 `exit 1`。

## 安全

脚本内 `DEFAULT_TOKEN` 应保持为空，勿将真实 Token 提交版本库。
