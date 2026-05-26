# 001：修复 JSON 流水导入重复创建同名资金账户

**日期**：2026-05-26

## 问题

JSON 导入时，若流水记录中的账户名称（如「现金」）未映射到 `channelHint`，服务端会对每条流水并发调用 `getOrCreateCashFundAccount`，产生多个同名账户。

## 修复

- **服务端** `resolveImportFlowAccountId`：顺序解析账户并缓存，支持 `accountName`、`account.name`、`fundAccount`、`资金账户` 等字段；校验 `accountId` 是否属于当前用户；同名账户只创建一次。
- **前端** `FlowJsonImportDialog.vue`：导入前将上述账户字段映射为 `channelHint`；忽略本地不存在的 `accountId`，改按名称匹配/创建。
- **账户新增 API**：同名账户已存在时直接返回已有记录，不再重复创建。
