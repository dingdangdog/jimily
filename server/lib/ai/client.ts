import OpenAI from "openai";
import {
  getSystemAIProvidersPage,
  getSystemAIProviderById,
} from "~~/server/utils/db";

async function getProvider(providerId?: string | null) {
  if (providerId) {
    const p = await getSystemAIProviderById(providerId);
    if (p?.isActive) return p;
  }
  const { data: providers } = await getSystemAIProvidersPage(
    { isActive: true },
    { pageNum: 1, pageSize: 1 },
  );
  return providers[0] ?? null;
}

/** Jimi 记账对话：限制上限，避免高温导致分类/金额解析漂移；低于此值时保留用户配置 */
export const CHAT_AGENT_DIALOG_TEMPERATURE_CAP = 0.35;

/** JSON 意图路由（结构化输出，保持低温度） */
export const CHAT_AGENT_ROUTER_TEMPERATURE = 0.1;

/** 工具结果摘要（略低温度，兼顾自然语气与忠实于数据） */
export const CHAT_AGENT_SUMMARY_TEMPERATURE = 0.25;

export function clampDialogTemperature(configured?: number | null): number {
  const cap = CHAT_AGENT_DIALOG_TEMPERATURE_CAP;
  const base =
    typeof configured === "number" && Number.isFinite(configured)
      ? configured
      : cap;
  return Math.min(base, cap);
}

/** 获取 OpenAI 兼容客户端，可选指定服务商 ID */
export async function getAIClient(
  providerId?: string | null,
): Promise<OpenAI | null> {
  const provider = await getProvider(providerId);
  if (provider?.apiKey) {
    return new OpenAI({
      apiKey: provider.apiKey,
      baseURL: provider.apiEndpoint || undefined,
    });
  }
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    return new OpenAI({ apiKey: key });
  }
  return null;
}

/** 获取 AI 配置（模型名等），可选指定服务商 ID */
export async function getAIProviderConfig(
  providerId?: string | null,
): Promise<{
  model: string;
  temperature?: number;
  maxTokens?: number;
} | null> {
  const provider = await getProvider(providerId);
  if (provider) {
    return {
      model: provider.apiModel || "gpt-4o-mini",
      temperature: provider.temperature ?? 0.5,
      maxTokens: provider.maxTokens ?? 3000,
    };
  }
  return {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    temperature: 0.5,
    maxTokens: 3000,
  };
}

/** 与 getAIClient/getAIProviderConfig 同源解析，用于落库「本条用户消息所用模型」快照 */
export async function getChatProviderSnapshot(providerId?: string | null): Promise<{
  usedProviderId: string | null;
  usedProviderName: string | null;
  usedApiModel: string | null;
}> {
  const provider = await getProvider(providerId);
  if (provider) {
    return {
      usedProviderId: provider.id,
      usedProviderName: provider.name,
      usedApiModel: provider.apiModel?.trim() || "gpt-4o-mini",
    };
  }
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  return {
    usedProviderId: null,
    usedProviderName: null,
    usedApiModel: model,
  };
}
