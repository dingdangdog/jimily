import prisma from "~~/server/lib/prisma";
import { runChatAgent } from "~~/server/lib/ai";
import { getChatProviderSnapshot } from "~~/server/lib/ai/client";

export type UserChatSessionMeta = {
  id: number;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function toSessionMeta(row: {
  id: number;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}): UserChatSessionMeta {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listUserChatSessions(
  userId: number,
): Promise<UserChatSessionMeta[]> {
  const sessions = await prisma.userChatSession.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return sessions.map(toSessionMeta);
}

export async function createUserChatSession(
  userId: number,
  title?: string | null | undefined,
) {
  let t = "新对话";
  if (title !== undefined && title !== null) {
    const s = title.trim().slice(0, 200);
    if (s) t = s;
  }
  const session = await prisma.userChatSession.create({
    data: { userId, title: t },
  });
  return toSessionMeta(session);
}

export async function getUserChatSessionForUser(
  userId: number,
  sessionId: number,
): Promise<UserChatSessionMeta | null> {
  const session = await prisma.userChatSession.findFirst({
    where: { id: sessionId, userId },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return session ? toSessionMeta(session) : null;
}

export async function deleteUserChatSession(
  userId: number,
  sessionId: number,
): Promise<boolean> {
  const session = await prisma.userChatSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) return false;
  await prisma.userChatMessage.deleteMany({ where: { sessionId } });
  await prisma.userChatSession.delete({ where: { id: sessionId } });
  return true;
}

export async function updateUserChatSessionTitle(
  userId: number,
  sessionId: number,
  title: string | null,
): Promise<UserChatSessionMeta | null> {
  const session = await prisma.userChatSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) return null;
  const updated = await prisma.userChatSession.update({
    where: { id: sessionId },
    data: { title: title?.trim().slice(0, 200) || null },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
  return toSessionMeta(updated);
}

export async function listUserChatMessages(
  userId: number,
  sessionId: number,
) {
  const session = await prisma.userChatSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!session) return null;
  const messages = await prisma.userChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      content: true,
      meta: true,
      createdAt: true,
      clientRequestId: true,
      usedProviderId: true,
      usedProviderName: true,
      usedApiModel: true,
    },
  });
  return messages;
}

export type PersistedChatResult =
  | {
      kind: "ok";
      content: string;
      sessionId: number;
      session: UserChatSessionMeta;
      assistantMeta: Record<string, unknown> | null;
    }
  | {
      kind: "error";
      reason: string;
      sessionId: number;
      failContent: string;
      session: UserChatSessionMeta;
    };

/** 同一用户、同一 clientRequestId 的并发/重试合并，避免重复落库与重复记账 */
const IDEM_TTL_MS = 24 * 60 * 60 * 1000;
const IDEM_MAX_KEY_LEN = 80;
const idemInflight = new Map<string, Promise<PersistedChatResult>>();
const idemCompleted = new Map<string, { expires: number; json: string }>();

function idemCacheKey(userId: number, clientRequestId: string): string {
  return `${userId}\n${clientRequestId}`;
}

function pruneIdemCompleted(): void {
  const now = Date.now();
  for (const [k, v] of idemCompleted) {
    if (v.expires < now) idemCompleted.delete(k);
  }
}

function isPrismaUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { code?: string }).code === "P2002"
  );
}

/**
 * 持久化对话：无有效 sessionId 时新建会话；写入用户消息、调用 AI、写入助手消息。
 * 可选 `clientRequestId`（建议 UUID）：相同用户下相同 id 的并发请求会共享同一次执行；完成后短时内重复请求直接返回同一结果，减轻重复发送导致的重复记账。
 */
export async function runPersistedUserChat(params: {
  userId: number;
  sessionId?: number | null;
  content: string;
  providerId?: string;
  clientRequestId?: string | null;
}): Promise<PersistedChatResult> {
  const rawId = params.clientRequestId?.trim();
  const clientRequestId =
    rawId && rawId.length > 0 && rawId.length <= IDEM_MAX_KEY_LEN
      ? rawId
      : undefined;

  if (clientRequestId) {
    pruneIdemCompleted();
    const key = idemCacheKey(params.userId, clientRequestId);
    const hit = idemCompleted.get(key);
    if (hit && hit.expires > Date.now()) {
      return JSON.parse(hit.json) as PersistedChatResult;
    }
    const existing = idemInflight.get(key);
    if (existing) {
      return await existing;
    }
  }

  const promise = executePersistedUserChat({
    userId: params.userId,
    sessionId: params.sessionId,
    content: params.content,
    providerId: params.providerId,
    clientRequestId,
  }).then((result) => {
    if (clientRequestId) {
      const key = idemCacheKey(params.userId, clientRequestId);
      idemCompleted.set(key, {
        expires: Date.now() + IDEM_TTL_MS,
        json: JSON.stringify(result),
      });
    }
    return result;
  });

  if (clientRequestId) {
    idemInflight.set(idemCacheKey(params.userId, clientRequestId), promise);
    promise.finally(() => {
      idemInflight.delete(idemCacheKey(params.userId, clientRequestId));
    });
  }

  return promise;
}

function assistantRowToPersistedResult(
  assistantRow: { content: string; meta: unknown },
  sessionId: number,
  session: UserChatSessionMeta,
): PersistedChatResult {
  const prefix = "对话失败：";
  if (assistantRow.content.startsWith(prefix)) {
    return {
      kind: "error",
      reason: assistantRow.content.slice(prefix.length),
      sessionId,
      failContent: assistantRow.content,
      session,
    };
  }
  return {
    kind: "ok",
    content: assistantRow.content,
    sessionId,
    session,
    assistantMeta:
      assistantRow.meta != null && typeof assistantRow.meta === "object"
        ? (assistantRow.meta as Record<string, unknown>)
        : null,
  };
}

async function appendAssistantFromDbHistory(params: {
  sessionId: number;
  userId: number;
  providerId?: string;
  getSessionMeta: () => Promise<UserChatSessionMeta>;
}): Promise<PersistedChatResult> {
  const { sessionId, userId, providerId, getSessionMeta } = params;

  const historyRows = await prisma.userChatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const messages = historyRows.map((r) => ({
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
  }));

  try {
    const result = await runChatAgent({
      userId,
      messages,
      maxToolRounds: 3,
      providerId,
    });

    await prisma.userChatMessage.create({
      data: {
        sessionId,
        role: "assistant",
        content: result.content,
        ...(result.assistantMeta != null
          ? { meta: result.assistantMeta as object }
          : {}),
      },
    });

    return {
      kind: "ok",
      content: result.content,
      sessionId,
      session: await getSessionMeta(),
      assistantMeta: result.assistantMeta ?? null,
    };
  } catch (e) {
    const reason = explainAIError(e);
    const failContent = `对话失败：${reason}`;
    await prisma.userChatMessage.create({
      data: {
        sessionId,
        role: "assistant",
        content: failContent,
      },
    });
    return {
      kind: "error",
      reason,
      sessionId,
      failContent,
      session: await getSessionMeta(),
    };
  }
}

async function executePersistedUserChat(params: {
  userId: number;
  sessionId?: number | null;
  content: string;
  providerId?: string;
  clientRequestId?: string;
}): Promise<PersistedChatResult> {
  const { userId, content: rawContent, providerId, clientRequestId } = params;
  const content = rawContent.trim();

  let session = null;
  if (params.sessionId != null) {
    const sid = Number(params.sessionId);
    if (!Number.isNaN(sid)) {
      session = await prisma.userChatSession.findFirst({
        where: { id: sid, userId },
      });
    }
  }
  if (!session) {
    session = await prisma.userChatSession.create({
      data: { userId, title: "新对话" },
    });
  }

  const msgCount = await prisma.userChatMessage.count({
    where: { sessionId: session.id },
  });
  if (msgCount === 0 && session.title === "新对话") {
    const title = content.length > 30 ? content.slice(0, 27) + "..." : content;
    await prisma.userChatSession.update({
      where: { id: session.id },
      data: { title },
    });
    session = { ...session, title };
  }

  const getSessionMeta = async (): Promise<UserChatSessionMeta> => {
    const row = await prisma.userChatSession.findUnique({
      where: { id: session.id },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return row ? toSessionMeta(row) : toSessionMeta(session);
  };

  const tryReplayExistingTurn = async (): Promise<PersistedChatResult | null> => {
    if (!clientRequestId) return null;
    const existingUser = await prisma.userChatMessage.findFirst({
      where: {
        sessionId: session.id,
        role: "user",
        clientRequestId,
      },
      orderBy: { createdAt: "asc" },
    });
    if (!existingUser) return null;

    const nextAssistant = await prisma.userChatMessage.findFirst({
      where: {
        sessionId: session.id,
        role: "assistant",
        createdAt: { gt: existingUser.createdAt },
      },
      orderBy: { createdAt: "asc" },
      select: { content: true, meta: true },
    });

    const meta = await getSessionMeta();
    if (nextAssistant) {
      return assistantRowToPersistedResult(nextAssistant, session.id, meta);
    }
    return await appendAssistantFromDbHistory({
      sessionId: session.id,
      userId,
      providerId,
      getSessionMeta,
    });
  };

  const replayEarly = await tryReplayExistingTurn();
  if (replayEarly) {
    return replayEarly;
  }

  const providerSnap = await getChatProviderSnapshot(providerId);

  try {
    await prisma.userChatMessage.create({
      data: {
        sessionId: session.id,
        role: "user",
        content,
        ...(clientRequestId ? { clientRequestId } : {}),
        usedProviderId: providerSnap.usedProviderId,
        usedProviderName: providerSnap.usedProviderName,
        usedApiModel: providerSnap.usedApiModel,
      },
    });
  } catch (e) {
    if (isPrismaUniqueViolation(e) && clientRequestId) {
      const again = await tryReplayExistingTurn();
      if (again) return again;
    }
    throw e;
  }

  return appendAssistantFromDbHistory({
    sessionId: session.id,
    userId,
    providerId,
    getSessionMeta,
  });
}

export function explainAIError(e: unknown): string {
  const msg =
    e instanceof Error
      ? e.message
      : typeof e === "string"
        ? e
        : String(e ?? "");
  if (
    msg.includes("方案1(tool_calls)失败：") &&
    msg.includes("方案2(json)失败：")
  ) {
    return `AI 双方案均失败：${msg}`;
  }
  if (
    msg.includes('"auto" tool choice requires') ||
    msg.includes("--enable-auto-tool-choice")
  ) {
    return "当前 AI 服务端未启用工具调用（tool_calls/auto tool choice），请更换支持工具调用的模型或在服务端开启对应参数。";
  }
  if (msg.toLowerCase().includes("unauthorized") || msg.includes("401")) {
    return "AI 服务鉴权失败，请检查 API Key。";
  }
  if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
    return "AI 服务限流，请稍后重试。";
  }
  return `AI 服务调用失败：${msg}`;
}
