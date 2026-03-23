# 001 — UiTextInput 必填星号与校验文案颜色

**日期：** 2026-03-23

## 变更说明

- 修改密码等使用 `UiTextInput` 且带 `required` 的表单中，必填星号此前与标签同色（`text-foreground/80`），视觉上不像「必填提示」。
- 将必填星号改为红色（`text-red-600 dark:text-red-400`），与后台其它表单（如手写 `label` + `text-red-500` 的 `*`）一致。
- 校验错误说明段落同步使用上述红色，在深色模式下对比度更好。

## 涉及文件

- `app/components/ui/TextInput.vue`
