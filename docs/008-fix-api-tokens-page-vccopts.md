# 008 — 修复 /user/api-tokens 导航 __vccOpts 报错

## 日期

2026-03-23

## 原因

在 `app/pages/user/` 下同时存在 `api-tokens.ts` 与 `api-tokens.client.vue` 时，Nuxt 会将同名 `.ts` 参与页面路由解析，导致该路由对应模块不是合法 Vue 组件，导航后出现 `Cannot read properties of undefined (reading '__vccOpts')`。

## 处理

将接口封装移至 `app/utils/user-api-token.ts`，删除 `app/pages/user/api-tokens.ts`，页面仅从 `~/utils/user-api-token` 引用。
