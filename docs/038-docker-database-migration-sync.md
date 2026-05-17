# 038：Docker 部署下的数据库同步方案（可复现）

## 结论先说

本仓库在 **Docker 镜像构建阶段不执行** 数据库迁移；同步发生在 **容器启动、应用进程拉起之后**，由 Nitro 启动插件调用自定义迁移运行器，读取镜像内 `prisma/migrations/*/migration.sql` 并写入与 Prisma 兼容的 `_prisma_migrations` 表。

因此复现要点是三块：

1. **镜像里带上** `prisma/migrations`（及运行时 Prisma Client 产物 `prisma/generated`）。
2. **实现** `server/lib/db-migrations.ts`（下文完整代码）。
3. **在应用启动最早阶段** 调用 `ensureDatabaseMigrations()`（下文插件示例）。

`prisma/migrations` 目录内容由 `prisma migrate dev` 等命令自动生成，各项目 schema 不同，本文不展开 migration SQL 本身。

---

## 整体流程

```mermaid
sequenceDiagram
  participant Docker as Docker 构建
  participant CMD as node server/index.mjs
  participant Plugin as Nitro 启动插件
  participant Mig as db-migrations.ts
  participant PG as PostgreSQL

  Docker->>Docker: pnpm build（含 prisma generate）
  Docker->>Docker: COPY .output + prisma/migrations + prisma/generated
  Note over Docker: 构建期不连库、不 migrate

  CMD->>Plugin: 进程启动
  Plugin->>Mig: ensureDatabaseMigrations()
  Mig->>PG: 库不存在则 CREATE DATABASE
  Mig->>PG: advisory lock + 读/写 _prisma_migrations
  Mig->>PG: 执行未应用的 migration.sql
  Plugin->>CMD: 迁移完成后继续种子数据等初始化
```

与「在 `entrypoint.sh` 里 `npx prisma migrate deploy`」相比，当前 **生产 Dockerfile 的 CMD 直接启动 Node**，不依赖镜像内安装 Prisma CLI；迁移逻辑完全在应用内用 `pg` 驱动完成。

仓库中仍保留 `docker/entrypoint.sh`（Prisma 官方 CLI 方式），但 **未挂到当前 Dockerfile 的 ENTRYPOINT/CMD**，仅作可选参考，见文末。

---

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | 目标库连接串，须含库名；`?schema=public` 指定 PostgreSQL schema |
| `DATABASE_AUTO_MIGRATE` | 否 | 设为 `false` 时跳过自动迁移 |
| `DATABASE_BOOTSTRAP_URL` | 否 | 用于 `CREATE DATABASE` 的管理连接，默认把 `DATABASE_URL` 的库名改为 `postgres` |
| `DATABASE_SCHEMA` | 否 | 未在 URL 中带 `schema` 参数时的 schema 名，默认 `public` |

Compose 示例（仅展示与库相关的部分）：

```yaml
environment:
  DATABASE_URL: "postgresql://postgres:密码@主机:5432/库名?schema=public"
  # DATABASE_AUTO_MIGRATE: "false"   # 由外部运维执行迁移时可关闭
  # DATABASE_BOOTSTRAP_URL: "postgresql://postgres:密码@主机:5432/postgres"
```

---

## Docker 镜像：构建期做什么

构建阶段只做应用打包与拷贝迁移文件，**不连接数据库**。

```dockerfile
FROM node:22.21.1-alpine3.22 AS builder
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22.21.1-alpine3.22 AS runner
WORKDIR /app

COPY --from=builder /app/.output ./
COPY --from=builder /app/prisma/generated ./prisma/generated
COPY --from=builder /app/prisma/migrations ./prisma/migrations

ENV DATABASE_URL="postgresql://user:pass@host:5432/dbname?schema=public"
EXPOSE 9090
CMD ["node", "/app/server/index.mjs"]
```

说明：

- `pnpm build` 前需在开发机/CI 已执行 `prisma generate`，使 `prisma/generated` 存在并被 COPY 进镜像。
- 运行时工作目录为 `/app`，迁移运行器从 `process.cwd()/prisma/migrations` 读 SQL，与上述 COPY 路径一致。
- 最终镜像 **不需要** 安装 `prisma` CLI 包。

---

## 启动插件：在业务初始化之前跑迁移

迁移必须在任何 Prisma 查询之前完成。通过 Nitro 插件在启动时 `await`：

```typescript
// server/plugins/initdata.ts（与迁移相关的部分）
import { ensureDatabaseMigrations } from "~~/server/lib/db-migrations";

async function runStartupInitialization() {
  await ensureDatabaseMigrations();
  // …其下为种子数据、主题初始化等，与 schema 同步无关，各项目自定
}

export default defineNitroPlugin(async () => {
  await runStartupInitialization();
});
```

同一插件文件中后续的 `prisma.systemConfig.create` 等属于**数据种子**，不是结构同步；复现时保留 `ensureDatabaseMigrations()` 调用即可，种子逻辑按项目删减。

---

## 核心：自定义迁移运行器（完整代码）

路径约定：`server/lib/db-migrations.ts`。

行为摘要：

1. 按目录名排序读取 `prisma/migrations/<name>/migration.sql`。
2. 若目标库不存在（PostgreSQL `3D000`），用 bootstrap 连接执行 `CREATE DATABASE`。
3. 创建/使用 schema，获取 `pg_advisory_lock` 避免多实例并发迁移。
4. 维护 `_prisma_migrations` 表（字段与 Prisma 一致），checksum 为 SQL 的 SHA-256。
5. **Baseline**：已有业务表但无迁移历史时，若通过 `validateExistingSchemaIsLatest` 校验则只写入迁移记录、不重复执行 SQL（见下节适配说明）。
6. 对其余未应用迁移在事务中执行 SQL 并记录。

依赖：`pg`（已在 `package.json` 的 `dependencies` 中）。

```typescript
import { createHash, randomUUID } from "node:crypto";
import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "pg";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "prisma", "migrations");
const MIGRATIONS_TABLE = "_prisma_migrations";
const LOCK_KEY_1 = 20260328;
const LOCK_KEY_2 = 1;

type MigrationFile = {
  name: string;
  sql: string;
  checksum: string;
};

type DatabaseTarget = {
  databaseUrl: string;
  adminUrl: string;
  databaseName: string;
  schemaName: string;
};

const EXPECTED_TABLES = [
  "users",
  "user_flows",
  "user_fund_accounts",
  "user_budgets",
  "user_liabilities",
  "user_liability_repay_plans",
  "user_liability_repay_records",
  "user_receivables",
  "user_receivable_collect_plans",
  "user_receivable_collect_records",
  "user_investment_products",
  "user_investment_details",
  "user_fixed_flows",
  "user_type_relations",
  "system_ai_providers",
  "system_themes",
  "system_configs",
  "user_chat_sessions",
  "user_chat_messages",
];

let migrationTask: Promise<void> | null = null;

function getChecksum(sql: string) {
  return createHash("sha256").update(sql).digest("hex");
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll(`"`, `""`)}"`;
}

function getDatabaseTarget(): DatabaseTarget {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before applying migrations.");
  }

  const parsed = new URL(databaseUrl);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName) {
    throw new Error("DATABASE_URL must include a database name.");
  }

  const schemaName =
    parsed.searchParams.get("schema") ||
    process.env.DATABASE_SCHEMA ||
    "public";

  const adminUrl =
    process.env.DATABASE_BOOTSTRAP_URL ||
    (() => {
      const bootstrap = new URL(databaseUrl);
      bootstrap.pathname = "/postgres";
      return bootstrap.toString();
    })();

  return {
    databaseUrl,
    adminUrl,
    databaseName,
    schemaName,
  };
}

async function readMigrationFiles(): Promise<MigrationFile[]> {
  try {
    await access(MIGRATIONS_DIR);
  } catch {
    return [];
  }

  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrations = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (entry) => {
        const sql = await readFile(
          path.join(MIGRATIONS_DIR, entry.name, "migration.sql"),
          "utf8"
        );

        return {
          name: entry.name,
          sql,
          checksum: getChecksum(sql),
        };
      })
  );

  return migrations;
}

async function ensureMigrationsTable(client: Client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      "id" TEXT PRIMARY KEY,
      "checksum" TEXT NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" TEXT NOT NULL UNIQUE,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);
}

async function ensureSchema(client: Client, schemaName: string) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${quoteIdentifier(schemaName)}`);
  await client.query(`SET search_path TO ${quoteIdentifier(schemaName)}`);
}

async function loadAppliedMigrations(client: Client) {
  const result = await client.query<{
    migration_name: string;
    checksum: string;
  }>(
    `SELECT "migration_name", "checksum"
     FROM "${MIGRATIONS_TABLE}"
     WHERE "rolled_back_at" IS NULL`
  );

  return new Map(
    result.rows.map((row) => [row.migration_name, row.checksum] as const)
  );
}

async function hasUserTables(client: Client) {
  const result = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = ANY($1::text[])
      ) AS "exists"
    `,
    [EXPECTED_TABLES]
  );

  return Boolean(result.rows[0]?.exists);
}

async function validateExistingSchemaIsLatest(client: Client) {
  const tableCountResult = await client.query<{ count: string }>(
    `
      SELECT COUNT(*)::text AS "count"
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = ANY($1::text[])
    `,
    [EXPECTED_TABLES]
  );

  const existingTableCount = Number(tableCountResult.rows[0]?.count ?? 0);
  if (existingTableCount !== EXPECTED_TABLES.length) {
    return false;
  }

  const metaColumnResult = await client.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'user_chat_messages'
          AND column_name = 'meta'
      ) AS "exists"
    `
  );

  const removedColumnsResult = await client.query<{
    fund_account_type_exists: boolean;
    flow_pay_type_exists: boolean;
    fixed_flow_pay_type_exists: boolean;
  }>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'user_fund_accounts'
          AND column_name = 'accountType'
      ) AS "fund_account_type_exists",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'user_flows'
          AND column_name = 'payType'
      ) AS "flow_pay_type_exists",
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'user_fixed_flows'
          AND column_name = 'payType'
      ) AS "fixed_flow_pay_type_exists"
  `);

  const removed = removedColumnsResult.rows[0];

  return (
    Boolean(metaColumnResult.rows[0]?.exists) &&
    !removed?.fund_account_type_exists &&
    !removed?.flow_pay_type_exists &&
    !removed?.fixed_flow_pay_type_exists
  );
}

async function ensureDatabaseExists(target: DatabaseTarget) {
  const probeClient = new Client({
    connectionString: target.databaseUrl,
  });

  try {
    await probeClient.connect();
    await probeClient.end();
    return;
  } catch (error: any) {
    try {
      await probeClient.end();
    } catch {
      // Ignore close errors after failed connect.
    }

    if (error?.code !== "3D000") {
      throw error;
    }
  }

  const adminClient = new Client({
    connectionString: target.adminUrl,
  });

  await adminClient.connect();
  try {
    const existsResult = await adminClient.query<{ exists: boolean }>(
      "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1) AS exists",
      [target.databaseName]
    );

    if (!existsResult.rows[0]?.exists) {
      await adminClient.query(
        `CREATE DATABASE ${quoteIdentifier(target.databaseName)}`
      );
      console.log(`[db:migrate] created database ${target.databaseName}`);
    }
  } finally {
    await adminClient.end();
  }
}

async function baselineMigrations(
  client: Client,
  migrations: MigrationFile[],
  applied: Map<string, string>
) {
  if (applied.size > 0) {
    return;
  }

  const hasTables = await hasUserTables(client);
  if (!hasTables) {
    return;
  }

  const isLatestSchema = await validateExistingSchemaIsLatest(client);
  if (!isLatestSchema) {
    throw new Error(
      "Existing database schema detected without _prisma_migrations history, and the schema does not match the current expected version. Refusing automatic baseline to avoid duplicate execution or destructive drift."
    );
  }

  await client.query("BEGIN");
  try {
    for (const migration of migrations) {
      await client.query(
        `INSERT INTO "${MIGRATIONS_TABLE}" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES ($1, $2, NOW(), $3, NOW(), 1)`,
        [randomUUID(), migration.checksum, migration.name]
      );
      applied.set(migration.name, migration.checksum);
    }
    await client.query("COMMIT");
    console.log("[db:migrate] baselined existing schema");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function applyPendingMigrations() {
  const target = getDatabaseTarget();

  const migrations = await readMigrationFiles();
  if (migrations.length < 1) {
    return;
  }

  await ensureDatabaseExists(target);

  const client = new Client({
    connectionString: target.databaseUrl,
  });

  await client.connect();

  try {
    await ensureSchema(client, target.schemaName);
    await client.query("SELECT pg_advisory_lock($1, $2)", [
      LOCK_KEY_1,
      LOCK_KEY_2,
    ]);
    await ensureMigrationsTable(client);

    const applied = await loadAppliedMigrations(client);
    await baselineMigrations(client, migrations, applied);

    for (const migration of migrations) {
      const appliedChecksum = applied.get(migration.name);

      if (appliedChecksum) {
        if (appliedChecksum !== migration.checksum) {
          throw new Error(
            `Migration checksum mismatch: ${migration.name}. Existing databases cannot safely apply a modified migration file.`
          );
        }
        continue;
      }

      await client.query("BEGIN");
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO "${MIGRATIONS_TABLE}" ("id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count") VALUES ($1, $2, NOW(), $3, NOW(), 1)`,
          [randomUUID(), migration.checksum, migration.name]
        );
        await client.query("COMMIT");
        console.log(`[db:migrate] applied ${migration.name}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [
        LOCK_KEY_1,
        LOCK_KEY_2,
      ]);
    } catch {
      // Ignore unlock failures during shutdown/error handling.
    }
    await client.end();
  }
}

export async function ensureDatabaseMigrations() {
  if (process.env.DATABASE_AUTO_MIGRATE === "false") {
    return;
  }

  migrationTask ??= applyPendingMigrations();
  return migrationTask;
}
```

### 复现时必改的两处（与业务 schema 绑定）

1. **`EXPECTED_TABLES`**：改为你当前 `schema.prisma` 里 `@@map(...)` 后的实际表名列表，用于判断「是否已有旧库」。
2. **`validateExistingSchemaIsLatest`**：用于「无 `_prisma_migrations` 但表已存在」的 baseline 场景；应改成你当前最新 schema 的特征检测（列是否存在等）。新项目若不需要承接旧库，可简化为 `return false` 或直接去掉 baseline 分支，仅保留「空库 → 顺序执行全部 migration」。

`LOCK_KEY_1` / `LOCK_KEY_2` 在多项目复用时建议改成不同常量，避免与其他应用抢同一把 advisory lock。

---

## 运行时 Prisma Client（一笔带过）

应用通过 `DATABASE_URL` 连接库，Client 在构建期 generate 到 `prisma/generated`：

```typescript
// server/lib/prisma.ts
import { PrismaClient } from "~~/prisma/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  }),
});
export default prisma;
```

本地开发用 Prisma CLI 时可有 `prisma.config.ts` 指向 `DATABASE_URL`；与 Docker 内自动迁移无直接关系。

---

## 可选方案：entrypoint 中调用 Prisma CLI

仓库另有脚本（**当前 Dockerfile 未使用**）：

```sh
#!/bin/sh
npx prisma migrate deploy
exec node server/index.mjs
```

若采用此方式，需在 runner 阶段安装 `prisma` 包并 COPY `prisma/schema.prisma`、`prisma.config.ts` 等，镜像更大，且运行期依赖 `npx`/网络解析。当前生产路径以应用内 `db-migrations.ts` 为准。

---

## 运维与排错

| 现象 | 可能原因 |
|------|----------|
| 启动报错 `DATABASE_URL is required` | 未注入环境变量 |
| `Migration checksum mismatch` | 已应用的 migration 文件被改过，需新建迁移而非改历史 SQL |
| baseline 拒绝执行 | 旧库结构不符合 `validateExistingSchemaIsLatest`，需手工对齐或先 `prisma migrate resolve` 类处理 |
| 容器内找不到迁移 | 未 COPY `prisma/migrations` 或 `cwd` 不是 `/app` |
| 多副本同时启动 | advisory lock 会串行化迁移；仍建议发布时单实例先起或设 `DATABASE_AUTO_MIGRATE=false` 由 Job 执行 |

日志前缀：`[db:migrate]`，例如 `created database`、`baselined existing schema`、`applied <migration_name>`。

---

## 最小复现清单

1. 使用 Prisma 维护 `schema.prisma`，开发环境生成 `prisma/migrations`（无需手写 SQL）。
2. 将上文 `db-migrations.ts` 放入项目，按 schema 调整 `EXPECTED_TABLES` 与 baseline 校验。
3. 增加 Nitro/Express 等等价「启动插件」，首行 `await ensureDatabaseMigrations()`。
4. Dockerfile runner 阶段：`COPY prisma/migrations`（及 `prisma/generated`）。
5. 部署时配置 `DATABASE_URL`；需要自动建库时保证 bootstrap 账号有 `CREATEDB` 权限。

按以上步骤，其他 Nuxt/Nitro + Prisma + PostgreSQL 项目可在不把 Prisma CLI 打进镜像的前提下，实现与本文相同的「容器启动即同步 schema」行为。
