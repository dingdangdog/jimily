# 016 — 接口文档侧栏分类标题改为中文

## 说明

Scalar 等工具侧栏上的分组名来自 OpenAPI 的 **`tags[].name`**（以及各 operation 的 `tags` 字段，须与之一致）。

已将 `swagger.config.ts` 顶层 `tags` 的 `name` 与各 `server/api/**/*.ts` 中 `@swagger` 的 `tags: ["…"]` 统一为中文，顺序仍由 `swagger.config.ts` 中 `tags` 数组决定。

## 中英文对照（便于检索代码历史）

| 原英文 | 现中文 |
|--------|--------|
| Base | 基础 |
| User | 用户 |
| Admin | 管理后台 |
| AI v1 | AI 接口（v1） |
| Flow | 流水 |
| Flow Type | 流水分类 |
| Fixed Flow | 固定流水 |
| Budget | 预算 |
| Receivable | 应收 |
| Invoice | 发票 |
| Analytics | 统计分析 |
| Type Relation | 类型映射 |
| Candidate | 导入候选 |
| Deduplication | 去重 |
| Test | 测试 |
