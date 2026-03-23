# 005 — 流水分页/列表与统计接口日期区间修正

## 变更时间

2026-03-23

## 问题

`/api/entry/flow/page` 等接口使用 `startDay`、`endDay` 为同一天（如 `2026-03-23`）时，`where.day` 使用 `new Date("YYYY-MM-DD")` 作为 `gte` 与 `lte`。按 ECMAScript 规范，纯日期字符串按 **UTC 当日 00:00:00** 解析，故 `lte` 实为「该日零点」而非「该日结束」。库中流水 `day` 多为带具体时刻的时间戳，晚于该零点则被 `lte` 排除，导致 `total: 0`。

## 处理

- 将 `server/utils/db/flow.ts` 中的 `parseDateBoundary` **导出**，对 `YYYY-MM-DD` 使用**本地时区**的当天 `00:00:00.000` 与 `23:59:59.999`。
- `page.ts`、`list.ts` 及若干 analytics 接口改为使用 `parseDateBoundary`，与 `getFlowsPage` 的 `buildFlowWhere` 行为一致。

## 涉及文件

- `server/utils/db/flow.ts`
- `server/api/entry/flow/page.ts`
- `server/api/entry/flow/list.ts`
- `server/api/entry/analytics/common.ts`
- `server/api/entry/analytics/attribution.ts`
- `server/api/entry/analytics/industryType.ts`
- `server/api/entry/analytics/month.ts`
