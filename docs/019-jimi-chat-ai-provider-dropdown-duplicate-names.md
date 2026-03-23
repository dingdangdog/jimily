# 019：对话页 AI 服务商下拉只显示一项

## 现象

启用多个 AI 服务商后，对话页「当前模型」下拉只出现一条可选项。

## 原因（历史）

`UiComboInput` 曾用 `:key="item"`，多条配置**显示名称相同**时 Vue 列表 key 冲突；且用 `name` 回写 `id` 时 `find` 只命中第一条。

## 当前方案（按用户要求：不做任何去重）

- **不做**对 `name` 的自动拼接、加后缀、合并同类项等逻辑；重名由用户在后台自行区分。
- 使用原生 `<select>`，**`value` 绑定服务商 `id`**，**文案仅展示后台配置的 `name`**，每条配置一行，互不影响。
- `ComboInput.vue` 仍保留 `` :key="`${index}-${item}` ``，供其他场景下重复文案列表正常渲染（与业务去重无关）。

## 涉及文件

- `app/components/jimi/JimiChat.vue`
- `app/components/ui/ComboInput.vue`（通用 key）
- `server/api/entry/ai/providers.get.ts`（仅 `id`、`name`）

## 日期

2025-03-23（修订：改为 id 绑定 + 原生 select，取消展示层去重）
