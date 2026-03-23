# 003：移除流水/固定流水的支付方式字段（改由资金账户承担）

## 变更时间

2026-03-23

## 原因

资金账户已表达「钱从哪个池子进出」，`Flow` / `FixedFlow` 上的 `payType` 与账户信息重复且易不一致，故删除该字段；渠道类文本在导入/AI 解析中改为 `channelHint`，仅用于匹配资金账户，不入库。

## 数据库

- 迁移：`prisma/migrations/20260323120000_remove_flow_pay_type/migration.sql`（`user_flows`、`user_fixed_flows` 删除 `payType` 列）
- 部署后执行：`npx prisma migrate deploy`（或等价命令）

## 主要代码调整

- Prisma：`Flow`、`FixedFlow` 去掉 `payType`；`TypeRelation` 注释更新
- 服务端：`fund-account` 中 `resolveFundAccountByPayType` 重命名为 `resolveFundAccountByChannelText`；流水 CRUD、导入、去重条件、分析 `common` 分组新增 `fundAccount`；删除 `analytics/payType`、`flow/type/getPayType`；`receivable/toflow` 改为 `accountId`；消费偏好统计改为按 `accountId` 聚合
- 前端：筛选与图表下钻改为 `accountId` / `accountUnassigned`；批量修改支持资金账户；类型管理页仅保留收支类型；CSV/JSON 导入映射使用 `channelHint`

## OpenAPI

- `public/openapi.json` 若由工具从路由生成，需重新生成；手工维护的片段已部分在 `swagger.config.ts` 中同步
