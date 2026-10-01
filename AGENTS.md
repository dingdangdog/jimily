# Jimily / 记米粒 — AI 开发须知

记米粒是支持 AI 助手 Jimi 的个人记账本。定制开发应沿现有 Nuxt 全栈结构扩展，不另起一套后端或前端框架。

当前版本见 `package.json` 的 `version`。界面文案使用简体中文，没有独立 i18n 层。

## 开始前

1. 先读相关页面、接口、`server/utils/db` 和相邻组件，再改代码。以仓库里的实现为准。
2. 保护用户已有未提交修改，不回退、不顺手格式化无关文件。
3. 不读取、展示或提交 `.env`、密钥、数据库备份、`data/` 下的小票和账单文件。需要环境变量名时只看 `.env.example`。
4. 未经明确要求，不启动 `pnpm dev`、预览服务、Docker 或其它长期进程。
5. 不伪造测试结果。未执行的检查写明「未测试」。

## 技术栈

- Nuxt 4 + Vue 3，`ssr: false`，开发与容器端口均为 `9090`。
- Nitro 提供 `server/api` 路由。
- Tailwind CSS。主题色来自数据库中的 `SystemTheme`，页面使用 `bg-surface`、`text-foreground`、`border-border`、`text-primary-*` 等语义类，不要写死一套新配色。
- Pinia：`app/stores/user.ts`、`app/stores/theme.ts`。
- Prisma 7 + PostgreSQL。客户端在 `prisma/generated`，业务代码只通过 `~~/server/lib/prisma` 使用。
- 图表：ECharts（`nuxt-echarts`）。图标：`@heroicons/vue`。提示：`vue-toastification`，经 `app/utils/alert.ts` / `app/utils/toast.ts` 使用。
- AI：`openai` SDK，服务商配置存在 `SystemAIProvider`。

## 目录

| 路径 | 职责 |
| --- | --- |
| `app/pages` | 路由页面。业务页多为 `*.client.vue` |
| `app/components` | `layout` 壳层、`flows` 流水、`jimi` 对话、`charts` 图表、`dialog` 弹窗、`ui` 基础控件 |
| `app/layouts/public.vue` | 登录后主壳（侧栏、顶栏、底栏） |
| `app/middleware` | `auth` 登录校验，`admin` 管理员校验 |
| `app/utils/api.ts` | 前端请求封装 `doApi` |
| `server/api/entry` | 登录用户的业务接口 |
| `server/api/admin` | 管理员接口 |
| `server/api/v1` | 对外 AI 接口，与网页 Jimi 同源 |
| `server/api/login.ts` 等 | 登录、注册、初始化等公开接口 |
| `server/middleware/auth.ts` | `/api/entry`、`/api/admin`、`/api/v1` 的 JWT 校验 |
| `server/utils/db` | 按领域拆分的数据访问；`index.ts` 统一导出 |
| `server/lib/ai` | Jimi：客户端、对话代理、工具、账单解析、会话持久化 |
| `server/lib/db-migrations.ts` | 进程启动时应用 `prisma/migrations` |
| `prisma/schema.prisma` | 数据模型 |
| `public/openapi.json` | 构建时生成的 OpenAPI，不要手改 |
| `docker/` | 部署与自动更新脚本 |

根路由 `/` 会跳到 `/user/jimi`。

## 页面与导航

登录后页面使用：

```ts
definePageMeta({
  layout: "public",
  middleware: ["auth"],
});
```

管理页再加 `middleware: ["admin"]`，或同时使用 `["auth", "admin"]`，与同目录现有页面保持一致。

侧栏菜单在 `app/components/layout/AppSidebar.vue`。移动端底栏只有预算、分析、日历、流水，定义在 `app/components/layout/AppBottomNav.vue`。新增常驻入口时两处都要考虑。

现有用户功能：

- `/user/jimi`：Jimi 对话
- `/user/calendar`：日历
- `/user/analysis`：统计图
- `/user/accounts`：资金账户
- `/user/flows`：流水
- `/user/receivable`：借出
- `/user/budget`：预算
- `/user/types`：分类
- `/user/typeRelations`：类型映射
- `/user/api-tokens`：API 令牌

管理功能：`/admin/users`、`/admin/ais`、`/admin/themes`、`/admin/config`（含备份恢复）。

`Liability`、`InvestmentProduct` 等模型已在 schema 和 Jimi 工具中使用，没有独立用户页面。补页面时复用现有列表、抽屉和弹窗写法，不要新造一套交互。

## 接口约定

统一响应体在 `server/utils/model.ts` 与 `server/utils/common.ts`：

- 成功：`success(data)` → `{ c: 200, d, m: "" }`
- 业务失败：`error(message)` → `{ c: 500, m }`
- 未登录或无权限：`noPermissions(message)` → `{ c: 400, m }`

`doApi` 在 `c === 200` 时只把 `d` 返回给页面；`c === 400` 会跳转登录。页面不要再解析整包 `{ c, d, m }`，除非该处本来就直接使用 `$fetch` / `useFetch`。

路径习惯：

- 用户业务放在 `/api/entry/<领域>/...`，管理放在 `/api/admin/<领域>/...`。
- 现有接口大量使用 POST，即使是查询。新接口优先模仿同领域文件的方法，不把同一资源改成另一套 REST 风格。
- 路由文件名决定方法，例如 `add.ts`、`page.ts`、`list.ts`，或 `add.post.ts`。
- 用户身份只从 JWT 取：`getUserId(event)` / `getAuthPayload(event)`。请求体里的 `userId` 不可信。
- 查询和写入必须带当前 `userId` 约束。不得返回或修改其他用户的数据。

登录态是 Cookie `Authorization` 中的 JWT，密钥为 `NUXT_AUTH_SECRET`。用户 API 令牌是同一套 JWT，额外带 `typ: "api_access"`，用 `Authorization: Bearer` 调用，不写登录 Cookie。签发逻辑在 `server/utils/api-access-token.ts`。

密码哈希是 `SHA-256(用户名 + 明文密码)`，见 `encryptBySHA256`。不要换成另一种算法，除非同时做存量用户迁移。

新增或修改对外接口时，在处理函数上方按现有文件补 `@swagger` 注释。`pnpm build` 会生成 `public/openapi.json`。

## 数据模型要点

PostgreSQL。表名由 `@@map` 指定，例如流水是 `user_flows`。

- `Flow`：流水。`flowType` 为「收入」「支出」「不计收支」。收入和支出金额按绝对值保存。`eliminate`：`0` 未平账，`1` 已平账，`-1` 忽略平账。`flowNo` 唯一。
- `FundAccount`：资金账户。账户类型由名称和用途表达，没有单独的账户类型字段。余额由流水重算，写入流水后调用 `recalcFundAccountFromFlows`，不要只改 `currentBalance`。
- `Budget`：按 `YYYY-MM` 的月预算。
- `Receivable` 及收款计划、收款记录：借出。状态含义以 schema 注释为准。
- `Liability` 及还款计划、还款记录：负债。目前主要供 Jimi 工具使用。
- `FixedFlow`：周期性流水模板。
- `TypeRelation`：分类映射。
- `SystemAIProvider`：AI 服务商。`apiKey` 属于密钥，日志和接口响应中不要回传。
- `SystemTheme`：主题，`colors` 为 JSON 文本。
- `SystemConfig`：站点设置，固定主键 `id = 1`。
- `UserChatSession` / `UserChatMessage`：Jimi 会话。用户消息可用 `clientRequestId` 做同会话幂等。

所有业务查询默认按当前用户隔离。

## Jimi

网页对话入口是 `server/api/entry/ai/chat.post.ts`，对外等价入口是 `server/api/v1/ai/chat.post.ts`。两者都应走 `runPersistedUserChat`，保证会话落库。

工具调用链路：

1. `server/lib/ai/chat-agent.ts`：人设、分类规则和多轮工具执行。
2. `server/lib/ai/tools.ts`：`CHAT_TOOLS` 定义，以及 `executeTool`。
3. `server/utils/db` 中的 `*ByAI` 函数：真正的查询和落库。

让 Jimi 支持新能力时，三处一起改。工具参数和系统提示要写清分类、金额、资金账户规则。用户未指定账户时，沿用现有「默认现金账户」行为，不要在工具里拒绝记账。回复必须基于工具结果，不编造账目。

账单解析在 `server/lib/ai/parse-bill.ts` 与 `parse-file.ts`。支付宝、微信、京东等导入在流水页和 `app/composables/useCsvFlowImport.ts`，扩展格式时复用这条导入链。

## 定制功能时的落点

1. 需要新表或新字段时，只改 `prisma/schema.prisma` 和对应业务代码。**不要新建、编辑或执行 Prisma migration**，也不要手写 `prisma/migrations/**/migration.sql`。提醒开发者本地执行迁移命令。应用启动时会由 `server/plugins/initdata.ts` 调用 `ensureDatabaseMigrations()` 应用已有迁移。
2. 数据访问放进 `server/utils/db/<领域>.ts`，并从 `server/utils/db/index.ts` 导出。接口层保持薄。
3. 接口放在对应的 `server/api/entry` 或 `server/api/admin` 目录，返回 `success` / `error`。
4. 页面放在 `app/pages`。复杂页面像流水页一样拆成 `app/components` 下的表格、工具栏、抽屉和弹窗。
5. 管理端列表可以像 `app/pages/admin/users/api.ts` 那样在页面目录放 `api.ts`。调用统一用 `doApi`。
6. 需要侧栏或底栏入口时改 `AppSidebar.vue` / `AppBottomNav.vue`。
7. 需要对话能力时补 Jimi 工具，而不是在前端再写一套意图解析。
8. 弹窗关闭不要靠点击遮罩丢失已填表单；现有表单弹窗保持显式取消。
9. 同时检查桌面与窄屏、加载、空数据、错误、禁用和长文本。断点与现有页面一致，底栏在 `lg` 以下显示。

缺少业务依据时，不要自造价格、权限、配额、默认分类或兼容分支。把待决定项留在回复里。

## 文档与变更记录

- 说明、使用指南、排障手册写入根目录 `docs/`。
- 设计方案写入根目录 `design/`。
- 修改代码或可执行脚本后，在根目录 `changelog/` 新增一份记录。文件名用三位递增编号加短横线说明，先看目录里已有编号，避免冲突。记录目的、改动、影响范围、是否需要开发者生成数据库迁移、验证结果和未做事项。

## 环境与部署

运行依赖 PostgreSQL。关键变量：

- `DATABASE_URL`
- `NUXT_ENV`：公网域名部署用 `production` 时，登录要求 HTTPS
- `NUXT_AUTH_SECRET`
- `NUXT_DATA_PATH`：小票等文件目录，默认与容器卷 `/app/data` 对应
- `NUXT_APP_VERSION`

镜像与版本号以 `package.json`、`Dockerfile` 和 `README.md` 中的发布说明为准。改版本时这些位置一起核对，不要只改一处。

`data/`、`.env`、本地数据库导出和账单样例不要提交。
