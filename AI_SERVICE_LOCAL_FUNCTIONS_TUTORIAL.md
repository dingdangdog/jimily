# AI 服务调用本地函数：技术教学与实现要点

当大模型需要「动手做事」——查库、写库、调内部 API、发通知——往往要在你的服务里执行真实代码。把「模型决策」和「本地执行」串起来，就是「AI 调用本地函数」要解决的事。本文基于 OpenAI 兼容的 Function Calling（工具调用）能力，说明如何设计一套通用、可落地的实现，并给出脱敏后的代码示例与优化方向。

---

## 适用场景与目标

典型场景包括：对话式业务操作（如「帮我记一笔」「查一下上个月的汇总」）、工单/任务创建、数据查询与统计、内部系统指令解析等。共同点是：用户用自然语言表达意图，模型负责解析并选出要调用的「工具」及参数，由你的后端执行具体逻辑，再把结果交给模型生成最终回复。

目标可以归纳为三点：**工具可描述**（模型知道有哪些函数、参数长什么样）、**执行在本地**（不把敏感逻辑或数据交给第三方）、**结果可反馈**（工具返回值能再次参与对话，用于生成自然语言回复）。

---

## 整体架构思路

采用「描述 + 执行」分离：用 OpenAI 的 `tools`（Function Calling）把本地能力描述成「名称 + 参数 schema」，模型在对话中返回 `tool_calls`；你的服务解析 `tool_calls`，在本地根据名称和参数调用真实函数，把返回值以 `role: "tool"` 的形式塞回消息列表，再请求一次模型，由模型基于工具结果生成面向用户的回复。这样，敏感逻辑与数据始终留在你的进程内，模型只做「选工具、填参数、写回复」。

若当前使用的模型或网关不支持 `tool_calls`，可增加一层降级：让模型输出结构化 JSON（例如 `{ "action": { "name", "args" }, "reply" }`），由你解析后同样走本地执行与二次请求，保证在「无 tool_calls」环境下仍能完成「解析 → 执行 → 总结」的闭环。

---

## 工具定义：OpenAI 格式

模型需要知道「有哪些函数、每个函数要什么参数」。OpenAI 约定用 `tools` 数组描述，每项为 `type: "function"`，并包含 `function.name`、`function.description`、`function.parameters`（JSON Schema）。描述越清晰，模型选错工具或漏填参数的概率越低。

下面是一组脱敏后的工具定义示例（名称与业务含义已泛化）：

```ts
import type { ChatCompletionTool } from "openai/resources/chat/completions";

export const CHAT_TOOLS: ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "create_item",
      description: "创建一条业务记录。当用户表达「记一笔」「添加」「登记」等意图时使用。",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "分类，如类型A、类型B" },
          amount: { type: "number", description: "金额或数量" },
          title: { type: "string", description: "标题/摘要" },
          date: { type: "string", description: "日期 YYYY-MM-DD，不传则当天" },
          remark: { type: "string", description: "备注" },
        },
        required: ["category", "amount", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_items",
      description: "按条件查询业务记录。当用户要「查一下」「列出」「筛选」时使用。",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "按分类筛选" },
          startDate: { type: "string", description: "开始日期 YYYY-MM-DD" },
          endDate: { type: "string", description: "结束日期 YYYY-MM-DD" },
          pageNum: { type: "number", description: "页码，默认 1" },
          pageSize: { type: "number", description: "每页条数，默认 15" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_summary",
      description: "获取汇总统计。当用户问「总共多少」「统计」「汇总」时使用。",
      parameters: {
        type: "object",
        properties: {
          startDate: { type: "string", description: "开始日期 YYYY-MM-DD" },
          endDate: { type: "string", description: "结束日期 YYYY-MM-DD" },
          month: { type: "string", description: "月份 YYYY-MM，与日期范围二选一" },
        },
      },
    },
  },
];
```

实际项目中可根据业务增删工具、细化 `description` 和 `properties`，必要时用 `enum` 约束取值，减少模型乱填。

---

## 本地执行器：名称到函数的映射

工具执行层只做两件事：根据 `name` 找到对应实现，把 `args` 和运行时上下文（如当前用户 ID、租户 ID）传入，并返回字符串形式的结果（通常 JSON），以便拼进 `role: "tool"` 的消息里。

脱敏后的执行器示例：

```ts
export interface ToolExecutionContext {
  userId: number;
  // 可扩展：tenantId, requestId, locale 等
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<string> {
  switch (name) {
    case "create_item":
      return execCreateItem(args, ctx);
    case "list_items":
      return execListItems(args, ctx);
    case "get_summary":
      return execGetSummary(args, ctx);
    default:
      return JSON.stringify({ success: false, message: `未知工具: ${name}` });
  }
}

async function execCreateItem(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<string> {
  const category = String(args.category ?? "");
  const amount = Number(args.amount ?? 0);
  const title = String(args.title ?? "");
  const date = args.date ? new Date(String(args.date)) : new Date();
  const remark = args.remark ? String(args.remark) : null;

  if (!title || Number.isNaN(amount)) {
    return JSON.stringify({ success: false, message: "标题与数值不能为空" });
  }

  // 此处接入真实持久化（数据库、API 等）
  const created = await yourCreateItemService({
    userId: ctx.userId,
    category,
    amount,
    title,
    date,
    remark,
  });

  return JSON.stringify({
    success: true,
    item: { id: created.id, title: created.title, amount: created.amount },
  });
}
```

`list_items`、`get_summary` 同理：从 `args` 里安全地取参（类型转换、默认值），调用业务层，再 `JSON.stringify` 返回。这样 agent 层无需关心具体表结构或 RPC，只依赖「工具名 + 参数字典 → 字符串结果」的约定。

---

## 对话代理：带 tool_calls 的多轮循环

Agent 层维护一条「消息链」：系统提示 + 用户历史 + 本轮模型回复。若模型返回了 `tool_calls`，则遍历每个调用，解析 `function.name` 和 `function.arguments`（JSON），可选地做一次参数补全（例如把「今天」「本月」换成真实日期），再调用 `executeTool`，把结果以 `role: "tool"`、`tool_call_id` 与模型返回的 id 对应地追加到消息链，然后继续请求模型；若无 `tool_calls` 或已达最大轮数，则用当前 `message.content` 作为最终回复，若本轮有执行过工具，通常再请求一次模型让其根据工具结果生成一句自然语言总结。

核心循环的脱敏示例：

```ts
async function runWithToolCalls(opts: {
  userId: number;
  messages: ChatCompletionMessageParam[];
  maxToolRounds: number;
  client: OpenAI;
  config: { model: string; temperature?: number; maxTokens?: number };
}): Promise<{ content: string }> {
  const { userId, messages, maxToolRounds, client, config } = opts;
  const fullMessages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
  ];

  let round = 0;
  let lastContent = "";

  while (round < maxToolRounds) {
    const response = await client.chat.completions.create({
      model: config.model,
      temperature: config.temperature ?? 0.5,
      max_tokens: config.maxTokens ?? 3000,
      messages: fullMessages,
      tools: CHAT_TOOLS,
    });

    const msg = response.choices[0]?.message;
    if (!msg) return { content: "未返回有效响应" };

    fullMessages.push(msg);

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      lastContent = msg.content ?? "操作已完成。";
      break;
    }

    for (const tc of toolCalls) {
      if (tc.type !== "function") continue;
      const name = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      const output = await executeTool(name, args, { userId });
      fullMessages.push({
        role: "tool",
        tool_call_id: tc.id!,
        content: output,
      });
    }
    round++;
  }

  // 若本轮执行过工具，再请求一次让模型基于结果生成自然语言
  if (fullMessages.some((m) => m.role === "tool")) {
    const finalResponse = await client.chat.completions.create({
      model: config.model,
      temperature: config.temperature ?? 0.5,
      max_tokens: config.maxTokens ?? 3000,
      messages: fullMessages,
    });
    const finalMsg = finalResponse.choices[0]?.message;
    lastContent = finalMsg?.content ?? lastContent ?? "操作已完成。";
  }

  return { content: lastContent };
}
```

要点：`tools` 只在「需要模型决定是否调用」的请求里传；最后一轮「只生成回复」的请求不要再带 `tools`，避免模型再次产生 tool_calls。`maxToolRounds` 防止异常情况下无限循环。

---

## 降级方案：无 tool_calls 时的 JSON 指令

部分模型或代理不支持 `tool_calls`，或会返回格式异常。可以增加一条「JSON 指令」路径：用系统提示要求模型只输出一个固定结构的 JSON，例如 `{ "action": { "name": "create_item" | "list_items" | "get_summary" | "none", "args": { ... } }, "reply": "可选预置回复" }`。你的代码解析该 JSON，若 `action.name` 不是 `"none"`，则用 `action.args` 调用 `executeTool`，再拿工具返回和 `reply` 一起发起一次「总结」请求，让模型根据工具结果生成最终回复；若 `action.name === "none"`，则直接使用 `reply` 作为回复。这样在不支持 tool_calls 的环境下仍能完成「解析意图 → 本地执行 → 自然语言总结」的流程。

```ts
const JSON_PLAN_SYSTEM = `你是指令解析助手。仅输出一个 JSON，不要 markdown 或额外说明。
格式：{ "action": { "name": "create_item"|"list_items"|"get_summary"|"none", "args": {...} }, "reply": "给用户的回复（name 为 none 时必填）" }
能调用工具时优先填 action，不要用 none。`;

async function runWithJsonPlan(opts: {
  userId: number;
  userText: string;
  client: OpenAI;
  config: { model: string; maxTokens?: number };
}): Promise<{ content: string }> {
  const { userId, userText, client, config } = opts;
  const res = await client.chat.completions.create({
    model: config.model,
    temperature: 0.1,
    max_tokens: config.maxTokens ?? 3000,
    messages: [{ role: "user", content: `${JSON_PLAN_SYSTEM}\n\n用户请求：${userText}` }],
  });
  const raw = res.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("未返回内容");

  const parsed = parseJsonPlan(raw); // 从 raw 中抽取 JSON 并 parse
  const name = parsed.action?.name;
  const args = parsed.action?.args ?? {};

  if (name && name !== "none") {
    const toolOutput = await executeTool(name, args, { userId });
    // 可选：再调一次模型，用 toolOutput + parsed.reply 生成最终 content
    return { content: await summarizeWithModel(client, config, userText, name, toolOutput, parsed.reply) };
  }
  return { content: parsed.reply?.trim() ?? "无法解析您的请求。" };
}
```

主入口可先尝试 `runWithToolCalls`，失败或返回空时再 fallback 到 `runWithJsonPlan`，保证兼容性。

---

## 参数补全与上下文

用户常说「今天」「本月」「上月」，模型未必会填成具体日期。在调用 `executeTool` 前，可根据当前服务器时间和用户原文做一次参数补全：例如检测到「今天」「今日」则写入 `date` 或 `startDate/endDay` 为当天；「本月」写入 `month` 为当前 YYYY-MM；「昨天」则用前一天。这样既减少模型负担，又避免歧义。实现上可在 agent 里对 `args` 做一次 `applyTemporalHints(toolName, args, userText, new Date())`，只改与时间相关的字段，其余保持模型原样。

---

## 小结

用「OpenAI tools 描述 + 本地 executeTool 映射」即可把 AI 的决策与本地能力打通；通过多轮消息（含 `role: "tool"`）和最后一轮无 tools 的总结请求，得到面向用户的自然语言回复。在不支持 tool_calls 的环境下，用「固定 JSON 指令 + 本地解析执行 + 二次总结」作为降级，仍能维持同一套执行层与业务逻辑。工具描述写清楚、参数做安全转换与时间等上下文补全，能显著提高可用性与稳定性。

---

## 代码优化建议

**工具层与类型安全**：为每个工具的 `args` 定义 TypeScript 接口或 Zod schema，在 `execXxx` 入口做校验与转换，避免把未校验的 `Record<string, unknown>` 直接传给业务层；未通过校验时返回结构化错误信息（如 `{ success: false, code: "VALIDATION_ERROR", details: [...] }`），便于日志与前端展示。

**执行层可插拔**：用注册表（Map<name, handler>）替代 switch，方便在测试或扩展时注入 mock 或新工具，而不改 agent 核心逻辑；handler 签名统一为 `(args, ctx) => Promise<string>`。

**轮次与 token 控制**：除 `maxToolRounds` 外，可设 `maxTotalTokens` 或单轮 token 上限，在消息链过长时截断或摘要历史，避免超长上下文导致延迟与超支。

**错误与重试**：工具执行抛错时，将错误信息（脱敏后）作为 tool 的 `content` 返回给模型，让模型有机会在回复中说明「操作失败」或引导用户修正；对可重试的临时错误（如网络超时）可在执行层做有限次重试再返回结果。

**日志与可观测**：对「每次工具调用」记录 name、args（脱敏）、结果长度、耗时，并打上 requestId/userId，便于排查与统计；可选地在开发环境把完整 messages 写日志，生产环境只记摘要。

**系统提示与时间**：若业务强依赖「当前时间」「当前用户时区」，在 system prompt 中显式注入服务器时间或时区，并约定日期格式（如 YYYY-MM-DD），减少模型猜测；时间相关参数补全逻辑集中在一个函数中，便于维护与单元测试。

**降级路径收敛**：tool_calls 与 JSON 两条路径尽量共用同一套「参数补全 → executeTool → 结果格式化」逻辑，避免两处实现漂移；总结阶段（根据工具结果生成自然语言）可抽成单一函数，供两种策略复用。

**安全与权限**：在执行前根据 `ctx.userId`（及可选 tenantId）校验该用户是否允许调用该工具、参数是否越权（如查他人数据）；对工具返回的字符串做大小或条数限制，避免一次性把大量数据塞进上下文。
