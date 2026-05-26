# 039：迁移 checksum 向后兼容（LF 归一化 + 历史库）

## 背景

`_prisma_migrations.checksum` 存的是 **SHA-256 十六进制**（不是 MD5）。线上库可能由以下方式写入：

1. **旧版** `db-migrations.ts`：对磁盘上的 `migration.sql` **原文**直接 hash（Windows 上常为 CRLF）。
2. **Prisma CLI**：对比迁移时会同时认可 LF / CRLF 两种行尾（2.29+）。
3. **新版 runner**：对 SQL 做 `\r\n`/`\r` → `\n` 归一化后再 hash（与 Prisma 写入新记录时一致）。

## 行为

- **新应用**的迁移：仍写入 LF 归一化后的 canonical checksum。
- **校验**已应用迁移：`checksumMatches` 在多种候选 hash 中匹配，任一命中即视为合规，避免升级 runner 后对未改动的 SQL 报 `checksum mismatch`。

候选包括：归一化 LF、磁盘原文、归一化后再展开为 CRLF、以及磁盘为 CRLF 时的 LF-only 原文 hash。

## 相关文件

- `server/lib/db-migrations.ts`：`normalizeMigrationSql`、`buildMigrationChecksumCandidates`、`getChecksum`
