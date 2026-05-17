# 支付宝/渠道 CSV 表头行动态识别

## 背景

支付宝官方导出 CSV 的说明区行数会变动。此前写死表头为 **0-based 索引 24**（肉眼第 25 行），与 2026-01~02 样例文件不符：样例中表头「交易时间」在 **索引 23**（肉眼第 24 行），写死值会把首条流水当成表头。

## 变更

- `app/utils/flowConvert.ts`：新增 `resolveTitleRowIndex`，按第一列等于「交易时间」定位表头；找不到时使用各渠道 `*_TITLE_ROW_FALLBACK`。
- 支付宝 fallback 调整为 **23**（原 24）。
- `app/composables/useCsvFlowImport.ts`、`app/pages/user/flows.client.vue`：解析 sheet 后调用动态识别，再构建 `csvHeaders` 与流水行。

## 验证

使用 `支付宝交易明细(20260101-20260228).csv`（GB2312）导入，应识别 3 条流水且列映射正确。
