# 029 — 管理端系统设置：Tab 布局与数据备份恢复

## 变更时间

2026-03-30

## 摘要

- 将 `app/pages/admin/config/index.client.vue` 改为「系统设置」Tab 页：「系统信息配置」与「数据备份与恢复」。
- 系统信息配置迁至子组件 `SystemInfoSettingsTab.vue`，逻辑与原页面一致（`api/admin/config`）。
- 新增备份能力（管理员 JWT，`/api/admin/backup/*`）：
  - **数据库**：`GET database-export` 返回统一 JSON 结构（`format: jimily-db-backup`, `version: 1`）；`POST database-import` 接收 multipart 字段 `file`（JSON 文件）。导入前在单事务内按依赖顺序清空业务表，再插入数据；**所有整型自增主键均不沿用备份中的 id**，并维护旧 id → 新 id 映射以重写外键，避免 PostgreSQL 序列与主键冲突。`SystemConfig` 固定 `id: 1` upsert。`SystemAIProvider` / `SystemTheme` 的字符串主键在导入时同样重新生成（不保留备份中的 id）。
  - **小票**：`GET invoices-export` 根据流水 `invoice` 字段收集文件名，从 `NUXT_DATA_PATH/images`（与上传接口一致）打包 zip 流下载；`POST invoices-import` 上传 zip，将其中文件按安全文件名规则解压到 `images`（同名覆盖）。
- 抽取 `server/lib/data-path.ts` 供数据目录解析复用。
- 核心导入逻辑在 `server/lib/admin-backup.ts`，便于后续随 Prisma 表结构扩展。

## 说明

- 仓库内未发现可用的历史 `/api/admin/entry/settings/export` 实现（仅 openapi 文档残留），故采用新路由与当前 `schema.prisma` 对齐。
- 导入数据库会删除现有用户与业务数据；导入完成后当前登录会话可能失效，需使用备份中的账号重新登录。
