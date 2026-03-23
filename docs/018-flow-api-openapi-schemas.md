# 018 — 流水相关接口 OpenAPI 入参/出参细化

## 变更说明

在 `server/lib/openapi-component-schemas.ts` 中补充、校正与流水一致的 schema：

- **CreateFlowDto**：对齐 `POST /api/entry/flow/add`（含 `industryType`、`accountId`、`accountDelta` 等，与 handler 一致）。
- **UpdateFlowDto**：必填 `id`，其余字段与 `update` handler 一致。
- **FlowListFilter**、**FlowPageFilter**：分别对应 `list`、`page` 的筛选与分页参数。
- **FlowPagePayload**：`page` 成功时 `d` 的结构（`total`、`pages`、`totalIn/Out`、`notInOut`、`data`）。
- **FlowAccountBrief**、**FlowWithAccount**：列表类接口在 `Flow` 上附加的 `account` 字段。
- **FlowIdBody**、**FlowIdsBody**、**FlowBatchDeletePayload**：单删、批量删请求与 `deleteMany` 的 `d`。
- **Flow**：与 Prisma 模型字段对齐（如 `flowNo`、中文 `flowType` 说明）。

并在下列文件的 `@swagger` 中改为 `$ref` + `allOf` 组合 **ApiEnvelope**：

- `flow/add.ts`、`list.ts`、`page.ts`、`update.ts`、`del.ts`、`all.ts`、`dels.ts`

## 验证

启动后打开 `/api-docs`，展开上述路径，应能看到请求体、响应体字段表；Models 中可查看 **CreateFlowDto**、**FlowWithAccount** 等。
