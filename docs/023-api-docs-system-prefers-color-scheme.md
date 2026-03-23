# API 文档页跟随系统明暗模式

## 变更

- 新增 `app/composables/usePrefersColorSchemeDark.ts`：监听 `prefers-color-scheme: dark`，在客户端随系统切换更新。
- `app/pages/api-docs.vue`：Scalar `configuration.darkMode` 改为使用上述偏好，不再使用 Pinia 主题 store；移除未使用的图标与 `toggleTheme`。

## 说明

仅控制文档组件的明暗展示；页面外围 CSS 变量仍沿用应用当前主题，与「只跟系统明暗、颜色细节可忽略」的需求一致。
