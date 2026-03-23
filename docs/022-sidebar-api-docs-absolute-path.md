# 022：侧栏「接口文档」跳转路径修正

## 日期

2026-03-23

## 问题

在 `/user/*` 页面点击侧栏「接口文档」时，会跳到 `/user/api-docs`，而接口文档页实际路由为 `/api-docs`。

## 原因

`auxiliaryMenuItems` 中该项 `path` 为 `api-docs`（无前导 `/`）。Nuxt 的 `navigateTo` 按相对路径解析，会拼在当前路由前缀下。

## 修改

- `app/components/layout/AppSidebar.vue`：将「接口文档」的 `path` 改为 `/api-docs`。
