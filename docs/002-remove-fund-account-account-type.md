# 002：移除资金账户 `accountType` 字段

## 变更说明

业务上「资金账户」本身即表示一类账本主体，不再维护独立的「账户类型」枚举字段，避免名称与类型重复、语义混淆。

## 数据库

- `FundAccount` 模型删除 `accountType` 列。
- 删除复合索引 `user_fund_accounts_userId_accountType_idx`。
- 迁移目录：`prisma/migrations/20260323120000_remove_fund_account_account_type/`。

## 应用层

- 账户增删改查与列表 API：不再接收、写入或按 `accountType` 过滤。
- `server/utils/db/fund-account.ts`：`resolveFundAccountByPayType` 仅按账户名称/机构匹配；`getOrCreateCashFundAccount` 仅按名称「现金」识别；AI 批量/查询返回结构去掉类型字段。
- `server/utils/db/flow.ts`：AI 记账返回的 `matchedFundAccount` 仅含 `id`、`name`。
- 管理端新建用户时的默认现金账户创建逻辑与上文一致。
- 前端账户页去掉类型表单项；流水/导入相关类型定义同步。
- Jimi AI 工具：`add_fund_account` 去掉 `accountType` 参数；`query_fund_accounts` 去掉类型过滤参数。

## 部署注意

合并后请在目标环境执行数据库迁移（例如 `npx prisma migrate deploy`），并重新生成/部署应用。
