# 025：移除 chat-agent 路由规则兜底（routeByRules）

## 变更时间

2026-03-28

## 变更说明

在 `server/lib/ai/chat-agent.ts` 的 `routeUserIntent` 中：

- 删除 `routeByRules` 及其全部基于正则的意图猜测逻辑。
- 当意图路由阶段发生异常（含 API 失败、空响应、JSON 解析失败、以及 `parseJsonPlan` 内抛错等）时，不再静默吞掉错误后走规则兜底，而是抛出带中文说明的 `Error`，并通过 `cause` 保留原始错误链便于排查。
- 保留：模型正常返回 JSON 但未给出受支持工具名时，仍返回 `action: none` 与原有温和引导文案（与规则兜底无关）。

## 动机

路由失败应视为该次识别不可用，向用户给出明确、友好的失败提示；避免在未经过模型结构化输出的情况下用正则强行选工具。
