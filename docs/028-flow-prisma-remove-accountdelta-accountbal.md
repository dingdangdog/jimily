# 028：新增/更新流水 Prisma 校验错误修复

## 现象

`prisma.flow.create()` 报错 `Unknown argument accountDelta`，因当前 `schema.prisma` 中 `Flow` 模型已无 `accountDelta`、`accountBal` 字段，但 `POST /api/entry/flow/add` 等接口仍在写入这两个字段。

## 原因

资金账户余额由 `recalcFundAccountFromFlows` 根据流水的 `flowType`、`money` 全量重算（见 `server/utils/db/flow-account-balance.ts` 注释：不维护每笔流水的 `accountBal`）。库表与 Prisma 模型已对齐为不含 `accountDelta`/`accountBal`，服务端部分 handler 仍保留旧字段写入。

## 修改

- `server/api/entry/flow/add.ts`：`create` 仅传入 schema 存在的字段；去掉对 `resolveFlowAccountDelta` 的依赖（该结果原仅用于写入已废弃列）。
- `server/api/entry/flow/update.ts`：更新数据去掉 `accountDelta`/`accountBal`；`money` 使用已归一化的 `nextMoney`（与收入/支出取绝对值逻辑一致）。
- `server/api/entry/flow/updates.ts`：批量更新不再写入上述列；移除仅服务于该列的 `resolveFlowAccountDelta` 计算。
- `server/api/entry/account/del.ts`：解绑流水时只将 `accountId` 置空。

## 说明

OpenAPI/前端类型中仍可保留 `accountDelta` 等说明字段（若存在），但服务端不再持久化；客户端传入的 `accountDelta` 对余额无影响，余额以重算逻辑为准。
