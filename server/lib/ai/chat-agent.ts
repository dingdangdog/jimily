import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import {
  getAIClient,
  getAIProviderConfig,
  CHAT_AGENT_ROUTER_TEMPERATURE,
  CHAT_AGENT_SUMMARY_TEMPERATURE,
  clampDialogTemperature,
} from "./client";
import { CHAT_TOOLS, executeTool } from "./tools";
import { getFundAccountsAll } from "~~/server/utils/db";

/** Jimi 核心行为：人设、分类、边界（工具路径与摘要共用逻辑由后续 system 引用） */
const JIMI_IDENTITY_BLOCK = `你的名字是 Jimi，是个人记账助手。语气自然、温和、简短，像朋友在帮对方理清账目；不要用生硬公文腔，也不要长篇寒暄。
核心任务：理解用户的记账/查账/统计/预算/账户等相关需求，并通过工具落库或查询。非记账类闲聊（与收支、账户、预算无关）：用一两句温和话回应即可，并轻轻引导回记账；不要展开科普、不要替用户做与记账无关的长篇建议。`;

const SYSTEM_PROMPT = `${JIMI_IDENTITY_BLOCK}

执行原则：
1) 能用工具就用工具，避免空泛聊天；
2) 回复必须基于工具结果，不编造；系统不单独存储「支付方式」字符串字段，但用户说的微信、支付宝、某银行卡等必须映射到「资金账户」（工具参数 channelHint / accountId / accountName），用于归属到哪张「钱包」；不要说「系统不支持记录支付方式」而拒绝处理账户归属。
3) 信息不足时，先问清关键参数（金额、收支方向、日期、分类、账户等）；
4) 记账时的行业分类 industryType：根据用户描述具体推断，优先使用常见中文分类名。公交/地铁/打车/停车/加油/过路费/共享单车等→「交通」；早餐/午餐/晚餐/外卖/奶茶/咖啡/聚餐等→「餐饮」；超市/买菜/日用品等→「购物」；房租/水电/物业/宽带→「居住」；电影/游戏/会员/演出→「娱乐」；药/医院/挂号→「医疗」；学费/培训/书籍→「教育」；工资/奖金/报销→「工资」或「收入」等明确收入项。只有无法归类时才用「其他」，不要把交通类记成「其他」。
5) 金额理解：如「早晚各一次各 2 元」「来回各 5 块」等，先正确计算合计金额（次数×单价）再记账；若一句内多笔同类支出，用户未要求拆分时，可合并为一条流水，name 中简要说明（如「早晚公交」）。
6) 资金账户：用户未说明账户时，按工具规则使用默认现金账户即可；用户补充「用支付宝/微信付的」时，应使用 update_flow 或 add_flow 的 channelHint 将流水归属到对应资金账户。
7) 用户纠正上一笔记账（改账户、改金额、改分类）时，使用 update_flow，并结合最近对话理解「刚才那笔」指哪一条。`;

export interface ChatAgentOptions {
  userId: number;
  messages: ChatCompletionMessageParam[];
  maxToolRounds?: number;
  /** 指定使用的 AI 服务商 ID，不传则用第一个可用 */
  providerId?: string | null;
}

export interface ChatAgentResult {
  content: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  strategy?: "tool_calls" | "json";
  /** 写入助手消息 meta，供前端展示「查看记账详情」等 */
  assistantMeta?: Record<string, unknown> | null;
}

const TOOL_CALLS_UNSUPPORTED_PROVIDERS = new Set<string>();

/**
 * AI 对话代理：解析用户意图并调用工具执行
 */
export async function runChatAgent(
  opts: ChatAgentOptions,
): Promise<ChatAgentResult> {
  const { userId, messages, maxToolRounds = 3, providerId } = opts;
  const client = await getAIClient(providerId);
  const config = await getAIProviderConfig(providerId);

  if (!client || !config) {
    return {
      content:
        "未配置 AI 服务，无法对话。请在系统设置中配置 AI 服务商（如 OpenAI、DeepSeek）的 API Key。",
    };
  }

  const providerCacheKey = getProviderCacheKey(providerId);
  const skipToolCalls = TOOL_CALLS_UNSUPPORTED_PROVIDERS.has(providerCacheKey);
  const latestUserText = getLatestUserText(messages);
  const requireTool = isLikelyToolIntent(latestUserText);
  logAIExecution({
    event: "start",
    userId,
    strategy: "json",
    userText: latestUserText,
    detail: {
      maxToolRounds,
      providerId: providerId ?? null,
      preferredStrategy: "json",
      fallbackStrategy: skipToolCalls ? "none" : "tool_calls",
    },
  });

  let jsonError: unknown = null;
  try {
    const result = await runWithJsonPlan({
      userId,
      messages,
      client,
      config,
      requireTool,
    });
    logAIExecution({
      event: "final_success",
      userId,
      strategy: "json",
      userText: latestUserText,
      toolCalls: result.toolCalls,
      detail: {
        executedCount: result.toolCalls?.length ?? 0,
        toolSummary: result.toolCalls?.length
          ? result.toolCalls.map((t) => ({ name: t.name, args: t.args }))
          : "未调用工具",
      },
    });
    return result;
  } catch (e) {
    jsonError = e;
    logAIExecution({
      event: "strategy_failed",
      userId,
      strategy: "json",
      userText: latestUserText,
      detail: { error: errorToMessage(e) },
    });
  }

  let toolCallsError: unknown = null;
  if (!skipToolCalls) {
    try {
      const result = await runWithToolCalls({
        userId,
        messages,
        maxToolRounds,
        client,
        config,
      });
      const executedCount = result.toolCalls?.length ?? 0;
      if (executedCount > 0 && result.content.trim()) {
        logAIExecution({
          event: "final_success",
          userId,
          strategy: "tool_calls",
          userText: latestUserText,
          toolCalls: result.toolCalls,
          detail: {
            executedCount,
            toolSummary: result.toolCalls?.map((t) => ({
              name: t.name,
              args: t.args,
            })),
          },
        });
        return result;
      }
      if (executedCount === 0) {
        toolCallsError = new Error("tool_calls 方案未执行任何工具");
        logAIExecution({
          event: "strategy_failed",
          userId,
          strategy: "tool_calls",
          userText: latestUserText,
          detail: {
            reason: "no_tool_calls",
            assistantContentPreview: result.content.slice(0, 300),
          },
        });
      } else {
        toolCallsError = new Error("tool_calls 方案返回空内容");
      }
    } catch (e) {
      toolCallsError = e;
      if (isToolCallsUnsupportedError(e)) {
        TOOL_CALLS_UNSUPPORTED_PROVIDERS.add(providerCacheKey);
      } else {
        logAIExecution({
          event: "strategy_failed",
          userId,
          strategy: "tool_calls",
          userText: latestUserText,
          detail: { error: errorToMessage(e) },
        });
      }
    }
  }

  const jsonMsg = errorToMessage(jsonError);
  const toolCallsMsg = errorToMessage(toolCallsError);
  logAIExecution({
    event: "all_failed",
    userId,
    strategy: "json",
    userText: latestUserText,
    detail: { jsonError: jsonMsg, toolCallsError: toolCallsMsg },
  });
  throw new Error(
    `方案1(json)失败：${jsonMsg}；方案2(tool_calls)失败：${toolCallsMsg}`,
  );
}

async function runWithToolCalls(opts: {
  userId: number;
  messages: ChatCompletionMessageParam[];
  maxToolRounds: number;
  client: NonNullable<Awaited<ReturnType<typeof getAIClient>>>;
  config: NonNullable<Awaited<ReturnType<typeof getAIProviderConfig>>>;
}): Promise<ChatAgentResult> {
  const { userId, messages, maxToolRounds, client, config } = opts;
  const now = new Date();
  const latestUserText = getLatestUserText(messages);
  const dialogTemp = clampDialogTemperature(config.temperature);
  const accountPrompt = await buildFundAccountsPrompt(userId);
  const fullMessages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildTimeAwareSystemPrompt(now, accountPrompt),
    },
    ...messages,
  ];
  const executedToolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }> = [];
  let assistantMeta: Record<string, unknown> | null = null;

  let round = 0;
  let lastContent = "";

  while (round < maxToolRounds) {
    const response = await client.chat.completions.create({
      model: config.model,
      temperature: dialogTemp,
      max_tokens: config.maxTokens ?? 3000,
      messages: fullMessages,
      tools: CHAT_TOOLS,
    });

    const msg = response.choices[0]?.message;
    if (!msg) {
      return { content: "AI 未返回有效响应" };
    }

    fullMessages.push(msg);

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      lastContent = msg.content || "操作已完成。";
      logAIExecution({
        event: "tool_execute",
        userId,
        strategy: "tool_calls",
        userText: latestUserText,
        detail: {
          round: round + 1,
          noToolCalls: true,
          assistantContentPreview: (msg.content || "").slice(0, 300),
        },
      });
      break;
    }

    for (const tc of toolCalls) {
      if (tc.type !== "function") {
        continue;
      }
      const name = tc.function.name;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments || "{}");
      } catch {
        args = {};
      }
      const normalizedArgs = applyTemporalHints(
        name,
        args,
        latestUserText,
        now,
      );
      executedToolCalls.push({ name, args: normalizedArgs });
      logAIExecution({
        event: "tool_execute",
        userId,
        strategy: "tool_calls",
        userText: latestUserText,
        detail: { round: round + 1, toolName: name, toolArgs: normalizedArgs },
      });
      const output = await executeTool(name, normalizedArgs, { userId });
      const metaFromTool = buildAssistantMetaFromToolOutput(name, output);
      if (metaFromTool) {
        assistantMeta = metaFromTool;
      }
      logAIExecution({
        event: "tool_execute",
        userId,
        strategy: "tool_calls",
        userText: latestUserText,
        detail: {
          round: round + 1,
          toolName: name,
          toolResultPreview:
            typeof output === "string"
              ? output.slice(0, 500)
              : String(output).slice(0, 500),
        },
      });
      fullMessages.push({
        role: "tool",
        tool_call_id: tc.id!,
        content: output,
      });
    }

    round++;
  }

  // 若有工具调用，再请求一次让模型基于结果生成自然语言回复
  if (fullMessages.some((m) => m.role === "tool")) {
    const finalResponse = await client.chat.completions.create({
      model: config.model,
      temperature: dialogTemp,
      max_tokens: config.maxTokens ?? 3000,
      messages: fullMessages,
    });
    const finalMsg = finalResponse.choices[0]?.message;
    lastContent = finalMsg?.content || lastContent || "操作已完成。";
  }

  return {
    content: lastContent,
    strategy: "tool_calls",
    toolCalls: executedToolCalls,
    assistantMeta: assistantMeta ?? undefined,
  };
}

const ROUTER_SYSTEM_PROMPT = `你是 Jimi 记账助手的「意图路由器」。只做一件事：把用户请求路由成可执行工具指令。
只输出 JSON，不要输出 markdown，不要输出额外解释。

输出格式：
{
  "action": {
    "name": "<工具名或none>",
    "args": { ... }
  },
  "reply": "当无法调用工具或需要澄清时给用户的简短回复（温和、简短）",
  "confidence": 0.0
}

路由原则（通用）：
1) 数据变更类（新增/修改）优先路由到写工具；
2) 查询类优先路由到 query_flows/query_flow_extremes/get_statistics；
3) 分析类（偏好、结构、画像、分类占比）优先路由到 analyze_consumption_preferences；
4) 能调用工具就不要返回 none；
5) 参数尽量结构化，数字字段必须是 number。

add_flow 专用：
- 金额：正确解析「各 N 元」「每人 N 元」「来回各 N」等，先算总支出/总收入再填入 money；同类多笔且用户未要求拆开时，合并一条，name 写清（如「早晚公交」）。
- industryType：公交/地铁/打车/共享单车/停车/加油等→「交通」；外卖/三餐/咖啡奶茶→「餐饮」；超市买菜→「购物」；房租水电→「居住」；娱乐会员→「娱乐」；医疗→「医疗」；教育培训→「教育」。仅在无法判断时用「其他」，不要把公交地铁归为「其他」。
- flowType：花费为「支出」，进账为「收入」。
- 用户提到支付宝、微信、某银行卡等：填入 channelHint 或从资金账户列表选 accountId，用于归属资金账户（不是「支付方式」字段，但必须映射到账户）。
- accountId：仅从提供的资金账户列表匹配；用户未提账户时不要编造，交给工具默认现金逻辑（args 可不填 accountId）。

update_flow 专用（纠正/补充上一笔或最近一笔流水）：
- 用户说「其实是支付宝付的」「改一下刚才那笔」「米线那笔账户不对」「金额改成 20」等 → 必须路由到 update_flow。
- 定位：优先 flowId；否则用 name 填条目关键字（如「米线」以匹配「淘宝六盒米线」）；若用户刚记过一笔，结合最近对话提取关键字。
- 改账户：channelHint 填「支付宝」「微信」等，或填 accountId。
- reply 中说明已改字段即可，不要声称「无法记录支付方式」。

非记账闲聊：action.name 用 "none"，reply 一两句温和回应并引导用户说出记账需求，不要长篇回答。`;

type JsonPlan = {
  action?: {
    name?: string;
    args?: Record<string, unknown>;
  };
  reply?: string;
  confidence?: number;
};

const JSON_SUPPORTED_ACTIONS = new Set([
  "add_flow",
  "update_flow",
  "query_flows",
  "query_flow_extremes",
  "get_statistics",
  "analyze_consumption_preferences",
  "add_fund_account",
  "batch_add_fund_accounts",
  "query_fund_accounts",
  "update_fund_account_balance",
  "set_budget",
  "query_budgets",
  "add_liability",
  "query_liabilities",
  "query_liability_repay_plans",
  "add_receivable",
  "query_receivables",
  "query_receivable_collect_plans",
  "add_investment_product",
  "query_investment_products",
  "add_investment_detail",
  "query_investment_details",
  "add_fixed_flow",
  "query_fixed_flows",
]);

async function runWithJsonPlan(opts: {
  userId: number;
  messages: ChatCompletionMessageParam[];
  client: NonNullable<Awaited<ReturnType<typeof getAIClient>>>;
  config: NonNullable<Awaited<ReturnType<typeof getAIProviderConfig>>>;
  requireTool?: boolean;
}): Promise<ChatAgentResult> {
  const { userId, messages, client, config, requireTool = false } = opts;
  const now = new Date();
  const latestUserText = getLatestUserText(messages);
  const accountPrompt = await buildFundAccountsPrompt(userId);
  if (!latestUserText) {
    throw new Error("json 方案未找到用户输入");
  }

  const parsed = await routeUserIntent({
    client,
    config,
    now,
    accountPrompt,
    messages,
    latestUserText,
  });
  const actionName = parsed.action?.name;
  const args = parsed.action?.args ?? {};
  if (actionName && JSON_SUPPORTED_ACTIONS.has(actionName)) {
    const firstArgs = applyTemporalHints(
      actionName,
      args,
      latestUserText,
      now,
    );
    const firstRun = await executeTool(actionName, firstArgs, {
      userId,
    });
    const verified = verifyToolOutput(actionName, firstRun);
    let finalToolName = actionName;
    let finalArgs = firstArgs;
    let toolOutput = firstRun;
    // 针对路由错误做一次轻量自愈：分析请求误路由到明细查询时，切到聚合分析工具
    if (!verified.ok && shouldFallbackToAnalysisTool(latestUserText, actionName)) {
      finalToolName = "analyze_consumption_preferences";
      finalArgs = applyTemporalHints(
        finalToolName,
        firstArgs,
        latestUserText,
        now,
      );
      toolOutput = await executeTool(finalToolName, finalArgs, { userId });
    }
    const finalText = await summarizeToolResult({
      client,
      config,
      userMessages: messages,
      toolName: finalToolName,
      toolOutput,
      hintReply: parsed.reply,
    });
    const assistantMeta = buildAssistantMetaFromToolOutput(
      finalToolName,
      toolOutput,
    );
    return {
      content: finalText,
      toolCalls: [{ name: finalToolName, args: finalArgs }],
      strategy: "json",
      assistantMeta: assistantMeta ?? undefined,
    };
  }

  const reply = parsed.reply?.trim();
  if (requireTool) {
    throw new Error("json 方案在工具意图下未产出可执行 action");
  }
  if (!reply) {
    throw new Error("json 方案缺少可用 reply");
  }
  return { content: reply, strategy: "json", assistantMeta: undefined };
}

async function routeUserIntent(opts: {
  client: NonNullable<Awaited<ReturnType<typeof getAIClient>>>;
  config: NonNullable<Awaited<ReturnType<typeof getAIProviderConfig>>>;
  now: Date;
  accountPrompt: string;
  messages: ChatCompletionMessageParam[];
  latestUserText: string;
}): Promise<JsonPlan> {
  const { client, config, now, accountPrompt, messages, latestUserText } = opts;
  const recentContext = buildRecentConversationContext(messages);
  const fullMessages: ChatCompletionMessageParam[] = [
    {
      role: "user",
      content: `${ROUTER_SYSTEM_PROMPT}\n\n可用工具：${[
        ...JSON_SUPPORTED_ACTIONS,
      ].join(", ")}\n当前服务器时间：${getNowContext(now)}\n${accountPrompt}\n最近对话上下文（仅供理解）：\n${recentContext}\n请基于以下用户请求返回 JSON：\n${latestUserText}`,
    },
  ];

  try {
    const planResponse = await client.chat.completions.create({
      model: config.model,
      temperature: CHAT_AGENT_ROUTER_TEMPERATURE,
      max_tokens: Math.min(config.maxTokens ?? 3000, 1200),
      messages: fullMessages,
    });
    const raw = planResponse.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error("router 未返回内容");
    }
    const parsed = parseJsonPlan(raw);
    if (parsed.action?.name && JSON_SUPPORTED_ACTIONS.has(parsed.action.name)) {
      return parsed;
    }
  } catch {
    // 路由失败时走规则兜底
  }

  const fallback = routeByRules(latestUserText);
  if (fallback) return fallback;
  return {
    action: { name: "none", args: {} },
    reply:
      "我有点没跟上呢～如果是记账或查账，跟我说下金额、是收入还是支出，或想查哪段时间就好。",
    confidence: 0.2,
  };
}

function routeByRules(text: string): JsonPlan | null {
  const t = text.trim();
  if (!t) return null;
  if (/(消费偏好|消费结构|支出结构|画像|按分类分析|偏好分析)/.test(t)) {
    return { action: { name: "analyze_consumption_preferences", args: {} }, confidence: 0.7 };
  }
  if (/(最高|最大|最贵|峰值|极值)/.test(t)) {
    return { action: { name: "query_flow_extremes", args: {} }, confidence: 0.65 };
  }
  if (/(统计|汇总|花了多少|总支出|总收入|收支)/.test(t)) {
    return { action: { name: "get_statistics", args: {} }, confidence: 0.65 };
  }
  if (/(查|查询|明细|流水|账单)/.test(t)) {
    return { action: { name: "query_flows", args: {} }, confidence: 0.6 };
  }
  if (/(记账|记一笔|新增支出|新增收入|花了|收入了|买了)/.test(t)) {
    return { action: { name: "add_flow", args: {} }, confidence: 0.6 };
  }
  if (
    /(其实是|改成|换成|纠正|改一下|修改|记错|不对|少记|多记|支付宝|微信支付|支付|付的)/.test(
      t,
    ) &&
    /(刚才|上一笔|那笔|这条|米线|流水|账户|金额|外卖|淘宝|块|元)/.test(t)
  ) {
    return { action: { name: "update_flow", args: {} }, confidence: 0.58 };
  }
  return null;
}

function verifyToolOutput(
  toolName: string,
  toolOutput: string,
): { ok: boolean; reason?: string } {
  try {
    const parsed = JSON.parse(toolOutput) as {
      success?: boolean;
      message?: string;
      total?: number;
      pageSize?: number;
    };
    if (parsed.success === false) {
      return { ok: false, reason: parsed.message || "tool_success_false" };
    }
    if (toolName === "query_flows" && typeof parsed.total === "number" && parsed.total > 0) {
      const pageSize = Number(parsed.pageSize ?? 15);
      if (parsed.total > pageSize) {
        return { ok: false, reason: "query_flows_pagination_risk" };
      }
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

function shouldFallbackToAnalysisTool(
  userText: string,
  toolName: string,
): boolean {
  if (toolName !== "query_flows" && toolName !== "get_statistics") return false;
  return /(消费偏好|消费结构|支出结构|画像|按分类分析|偏好分析|趋势)/.test(
    userText,
  );
}

function parseJsonPlan(raw: string): JsonPlan {
  try {
    return JSON.parse(raw) as JsonPlan;
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error("json 方案返回非 JSON 内容");
    }
    return JSON.parse(match[0]) as JsonPlan;
  }
}

function flowDayToYmd(day: unknown): string {
  if (day instanceof Date && !Number.isNaN(day.getTime())) {
    return formatDate(day);
  }
  if (typeof day === "string") {
    const s = day.trim();
    return s.length >= 10 ? s.slice(0, 10) : s;
  }
  return "";
}

/** 从 add_flow / update_flow 工具 JSON 结果生成前端可用的 meta */
function buildAssistantMetaFromToolOutput(
  toolName: string,
  toolOutput: string,
): Record<string, unknown> | null {
  if (toolName !== "add_flow" && toolName !== "update_flow") {
    return null;
  }
  try {
    const parsed = JSON.parse(toolOutput) as {
      success?: boolean;
      flow?: {
        id: number;
        flowNo?: string | null;
        day?: unknown;
        flowType?: string | null;
        industryType?: string | null;
        money?: number | null;
        name?: string | null;
        description?: string | null;
        origin?: string | null;
      };
      matchedFundAccount?: { id: number; name: string } | null;
    };
    if (!parsed.success || !parsed.flow) {
      return null;
    }
    const f = parsed.flow;
    return {
      flowBookkeeping: {
        action: toolName === "update_flow" ? "update" : "create",
        flow: {
          id: f.id,
          flowNo: f.flowNo ?? null,
          day: flowDayToYmd(f.day),
          flowType: f.flowType ?? null,
          industryType: f.industryType ?? null,
          money: f.money ?? null,
          name: f.name ?? null,
          description: f.description ?? null,
          origin: f.origin ?? null,
        },
        matchedFundAccount: parsed.matchedFundAccount ?? null,
      },
    };
  } catch {
    return null;
  }
}

async function summarizeToolResult(opts: {
  client: NonNullable<Awaited<ReturnType<typeof getAIClient>>>;
  config: NonNullable<Awaited<ReturnType<typeof getAIProviderConfig>>>;
  userMessages: ChatCompletionMessageParam[];
  toolName: string;
  toolOutput: string;
  hintReply?: string;
}): Promise<string> {
  const { client, config, userMessages, toolName, toolOutput, hintReply } =
    opts;
  const lastUser = getLatestUserText(userMessages);

  try {
    const res = await client.chat.completions.create({
      model: config.model,
      temperature: CHAT_AGENT_SUMMARY_TEMPERATURE,
      max_tokens: config.maxTokens ?? 1000,
      messages: [
        {
          role: "system",
          content:
            "你是 Jimi（记账助手）。请根据工具返回的 JSON 给用户写一段简短、温柔、口语化的中文回复。必须严格依据工具结果，不编造数据。用户说的支付宝/微信等对应「资金账户」归属，已在工具结果 matchedFundAccount 中体现，可直接说明记入哪个账户；不要说系统无法记录支付方式。优先说明成功与否、金额、分类（industryType）、条目名称、资金账户。非记账类请求若未调用工具，可温和简短回应并引导回记账。避免冗长寒暄。",
        },
        {
          role: "user",
          content: `用户原话：${lastUser}\n工具：${toolName}\n工具结果JSON：${toolOutput}\n参考回复：${hintReply || ""}`,
        },
      ],
    });
    const content = res.choices[0]?.message?.content?.trim();
    if (content) return content;
  } catch {
    // 忽略并走降级文本
  }

  try {
    const parsed = JSON.parse(toolOutput) as {
      success?: boolean;
      message?: string;
      total?: number;
      summary?: Record<string, number>;
      flow?: { name?: string; money?: number };
      account?: { name?: string; currentBalance?: number };
      created?: Array<{ name?: string }>;
      skipped?: string[];
    };
    if (toolName === "add_flow" && parsed.success) {
      const cat = (parsed.flow as { industryType?: string } | undefined)
        ?.industryType;
      const acct = (
        parsed as { matchedFundAccount?: { name?: string } }
      ).matchedFundAccount?.name;
      const amt = Math.abs(Number(parsed.flow?.money ?? 0));
      const base = `已记好：${parsed.flow?.name || "未命名"} ${amt} 元`;
      const catPart = cat ? `，分类「${cat}」` : "";
      const acctPart = acct ? `，账户「${acct}」` : "";
      return `${base}${catPart}${acctPart}。`;
    }
    if (toolName === "update_flow" && parsed.success) {
      const acct = (
        parsed as { matchedFundAccount?: { name?: string } }
      ).matchedFundAccount?.name;
      const amt = Math.abs(Number(parsed.flow?.money ?? 0));
      const base = `已更新：${parsed.flow?.name || "流水"} ${amt} 元`;
      const acctPart = acct ? `，当前归属账户「${acct}」` : "";
      return `${base}${acctPart}。`;
    }
    if (toolName === "query_flows") {
      return `查询完成，共 ${parsed.total ?? 0} 条。`;
    }
    if (toolName === "query_flow_extremes") {
      const expenseCount = Array.isArray(
        (parsed as { topExpense?: unknown[] }).topExpense,
      )
        ? (parsed as { topExpense?: unknown[] }).topExpense!.length
        : 0;
      const incomeCount = Array.isArray(
        (parsed as { topIncome?: unknown[] }).topIncome,
      )
        ? (parsed as { topIncome?: unknown[] }).topIncome!.length
        : 0;
      return `极值查询完成：最高支出 ${expenseCount} 条，最高收入 ${incomeCount} 条。`;
    }
    if (toolName === "get_statistics") {
      const summary = parsed.summary ?? {};
      const expense = Number(summary["支出"] ?? 0);
      const income = Number(summary["收入"] ?? 0);
      const byCategory = (parsed as { byCategory?: Record<string, Record<string, number>> })
        .byCategory;
      const expenseCategories = Object.entries(byCategory?.["支出"] ?? {})
        .map(([k, v]) => [k, Number(v)] as const)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([k, v]) => `${k} ${v.toFixed(2)}元`);
      return expenseCategories.length > 0
        ? `统计完成：总支出 ${expense.toFixed(2)} 元，总收入 ${income.toFixed(2)} 元；支出前三分类：${expenseCategories.join("、")}。`
        : `统计完成：总支出 ${expense.toFixed(2)} 元，总收入 ${income.toFixed(2)} 元。`;
    }
    if (toolName === "analyze_consumption_preferences") {
      const data = parsed as {
        totalExpense?: number;
        totalIncome?: number;
        totalCount?: number;
        expenseCount?: number;
        topExpenseCategories?: Array<{ category?: string; amount?: number; ratio?: number }>;
        topExpenseFundAccounts?: Array<{
          accountLabel?: string;
          amount?: number;
          ratio?: number;
        }>;
      };
      const categoryTop = (data.topExpenseCategories ?? [])
        .slice(0, 3)
        .map(
          (x) =>
            `${x.category || "其他"} ${Number(x.amount ?? 0).toFixed(2)}元（${(Number(x.ratio ?? 0) * 100).toFixed(1)}%）`,
        );
      const accountTop = (data.topExpenseFundAccounts ?? [])
        .slice(0, 2)
        .map(
          (x) =>
            `${x.accountLabel || "未知"} ${Number(x.amount ?? 0).toFixed(2)}元（${(Number(x.ratio ?? 0) * 100).toFixed(1)}%）`,
        );
      return `消费偏好分析完成：共 ${Number(data.totalCount ?? 0)} 笔，支出 ${Number(data.totalExpense ?? 0).toFixed(2)} 元、收入 ${Number(data.totalIncome ?? 0).toFixed(2)} 元。` +
        (categoryTop.length ? `支出主要集中在：${categoryTop.join("、")}。` : "") +
        (accountTop.length ? `主要支出账户：${accountTop.join("、")}。` : "");
    }
    if (toolName === "query_fund_accounts") {
      return `账户查询完成，共 ${parsed.total ?? 0} 个。`;
    }
    if (toolName === "query_liability_repay_plans") {
      return `还款计划查询完成，共 ${parsed.total ?? 0} 条。`;
    }
    if (toolName === "query_receivable_collect_plans") {
      return `回款计划查询完成，共 ${parsed.total ?? 0} 条。`;
    }
    if (toolName === "add_fund_account" && parsed.success) {
      return `资金账户已处理：${parsed.account?.name || "未命名账户"}。`;
    }
    if (toolName === "batch_add_fund_accounts" && parsed.success) {
      return `资金账户批量处理完成：新增 ${parsed.created?.length ?? 0} 个，跳过 ${parsed.skipped?.length ?? 0} 个。`;
    }
    if (toolName === "update_fund_account_balance" && parsed.success) {
      return `账户余额更新成功：${parsed.account?.name || "账户"} 当前余额 ${Number(parsed.account?.currentBalance ?? 0)}。`;
    }
    return parsed.message || "操作已完成。";
  } catch {
    return "操作已完成。";
  }
}

function getLatestUserText(messages: ChatCompletionMessageParam[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content.trim();
    if (Array.isArray(m.content)) {
      const t = m.content.find((x) => x.type === "text" && "text" in x);
      if (t && typeof t.text === "string") return t.text.trim();
    }
  }
  return "";
}

function buildRecentConversationContext(
  messages: ChatCompletionMessageParam[],
): string {
  const rows: string[] = [];
  for (let i = messages.length - 1; i >= 0 && rows.length < 6; i--) {
    const m = messages[i];
    if (!m) continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    const content =
      typeof m.content === "string"
        ? m.content.trim()
        : Array.isArray(m.content)
          ? m.content
            .filter((x) => x.type === "text" && "text" in x)
            .map((x) => (typeof x.text === "string" ? x.text : ""))
            .join(" ")
            .trim()
          : "";
    if (!content) continue;
    rows.push(
      `${m.role === "user" ? "用户" : "助手"}：${content.slice(0, 200)}`,
    );
  }
  if (rows.length === 0) return "无";
  return rows.reverse().join("\n");
}

function isLikelyToolIntent(text: string): boolean {
  if (!text) return false;
  return /(记账|记一笔|新增|添加|查|查询|统计|分析|偏好|总支出|总收入|花了多少|最高|最低|明细|流水|预算|账户|余额|负债|应收|投资|固定流水|纠正|修改|改一下|其实是|换成|刚才那笔|上一笔)/.test(
    text,
  );
}

function errorToMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return String(e ?? "未知错误");
}

function getProviderCacheKey(providerId?: string | null): string {
  return providerId ? `id:${providerId}` : "__default__";
}

function isToolCallsUnsupportedError(e: unknown): boolean {
  const msg = errorToMessage(e);
  return (
    msg.includes('auto" tool choice requires') ||
    msg.includes("--enable-auto-tool-choice") ||
    msg.includes("--tool-call-parser")
  );
}

function buildTimeAwareSystemPrompt(now: Date, accountPrompt: string): string {
  return `${SYSTEM_PROMPT}

当前服务器时间：${getNowContext(now)}
处理日期规则：
- 用户说“今天/昨日/昨天/本月/上月/今年”等类似词汇时，请按当前服务器时间换算，不要猜测年份。

${accountPrompt}`;
}

async function buildFundAccountsPrompt(userId: number): Promise<string> {
  const all = await getFundAccountsAll({ userId });
  const available = all.filter((x) => x.status !== -1);
  if (available.length === 0) {
    return "当前用户资金账户列表：暂无可用账户。";
  }
  const accountLines = available.map((x) => `- ${x.id}: ${x.name}`).join("\n");
  return `当前用户资金账户列表（id: 名称）：\n${accountLines}`;
}

function getNowContext(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function applyTemporalHints(
  toolName: string,
  args: Record<string, unknown>,
  latestUserText: string,
  now: Date,
): Record<string, unknown> {
  const text = latestUserText.trim();
  if (!text) return args;
  const next = { ...args };

  if (toolName === "add_flow" || toolName === "update_flow") {
    if (/(今天|今日)/.test(text)) next.day = formatDate(now);
    if (/(昨天|昨日)/.test(text)) next.day = formatDate(addDays(now, -1));
  }

  if (
    toolName === "query_flows" ||
    toolName === "get_statistics" ||
    toolName === "analyze_consumption_preferences" ||
    toolName === "query_flow_extremes" ||
    toolName === "query_liability_repay_plans" ||
    toolName === "query_receivable_collect_plans"
  ) {
    const hasExplicitRange = Boolean(next.startDay || next.endDay || next.month);
    if (!hasExplicitRange) {
      const monthMatch = text.match(/\b(20\d{2})[-\/年](0?[1-9]|1[0-2])月?\b/);
      if (monthMatch) {
        const y = monthMatch[1];
        const m = String(Number(monthMatch[2])).padStart(2, "0");
        next.month = `${y}-${m}`;
      } else {
        const yearMatch = text.match(/\b(20\d{2})年?\b/);
        if (yearMatch) {
          const y = Number(yearMatch[1]);
          next.startDay = `${y}-01-01`;
          next.endDay = `${y}-12-31`;
        }
      }
    }
    if (/(今天|今日)/.test(text)) {
      const day = formatDate(now);
      next.startDay = day;
      next.endDay = day;
      delete next.month;
    } else if (/(昨天|昨日)/.test(text)) {
      const day = formatDate(addDays(now, -1));
      next.startDay = day;
      next.endDay = day;
      delete next.month;
    } else if (/本月/.test(text)) {
      next.month = formatMonth(now);
      delete next.startDay;
      delete next.endDay;
    } else if (/上月/.test(text)) {
      next.month = formatMonth(
        new Date(now.getFullYear(), now.getMonth() - 1, 1),
      );
      delete next.startDay;
      delete next.endDay;
    } else if (/本周/.test(text)) {
      next.startDay = formatDate(getStartOfWeek(now));
      next.endDay = formatDate(getEndOfWeek(now));
      delete next.month;
    } else if (/上周/.test(text)) {
      const lastWeekBase = addDays(now, -7);
      next.startDay = formatDate(getStartOfWeek(lastWeekBase));
      next.endDay = formatDate(getEndOfWeek(lastWeekBase));
      delete next.month;
    } else if (/本年|今年/.test(text)) {
      next.startDay = formatDate(new Date(now.getFullYear(), 0, 1));
      next.endDay = formatDate(new Date(now.getFullYear(), 11, 31));
      delete next.month;
    } else if (/近7天|最近7天/.test(text)) {
      next.startDay = formatDate(addDays(now, -6));
      next.endDay = formatDate(now);
      delete next.month;
    } else if (/近30天|最近30天/.test(text)) {
      next.startDay = formatDate(addDays(now, -29));
      next.endDay = formatDate(now);
      delete next.month;
    }
  }
  return next;
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMonth(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function addDays(base: Date, delta: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + delta);
  return d;
}

function getStartOfWeek(d: Date): Date {
  const day = d.getDay();
  const delta = day === 0 ? -6 : 1 - day;
  const result = new Date(d);
  result.setDate(d.getDate() + delta);
  return result;
}

function getEndOfWeek(d: Date): Date {
  return addDays(getStartOfWeek(d), 6);
}

function logAIExecution(input: {
  event:
  | "start"
  | "tool_execute"
  | "strategy_failed"
  | "final_success"
  | "all_failed";
  userId: number;
  strategy: "tool_calls" | "json";
  userText?: string;
  toolCalls?: Array<{ name: string; args: Record<string, unknown> }>;
  detail?: Record<string, unknown>;
}): void {
  const payload = {
    ts: new Date().toISOString(),
    ...input,
  };
  console.info(`[AI_CHAT_EXEC] ${safeJson(payload)}`);
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
