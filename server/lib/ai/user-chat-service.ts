import prisma from "~~/server/lib/prisma";
import { runChatAgent } from "~~/server/lib/ai";

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
    select: { id: true, role: true, content: true, meta: true, createdAt: true },
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

/**
 * 持久化对话：无有效 sessionId 时新建会话；写入用户消息、调用 AI、写入助手消息。
 */
export async function runPersistedUserChat(params: {
  userId: number;
  sessionId?: number | null;
  content: string;
  providerId?: string;
}): Promise<PersistedChatResult> {
  const { userId, content: rawContent, providerId } = params;
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

  await prisma.userChatMessage.create({
    data: {
      sessionId: session.id,
      role: "user",
      content,
    },
  });

  const historyRows = await prisma.userChatMessage.findMany({
    where: { sessionId: session.id },
    orderBy: { createdAt: "asc" },
    select: { role: true, content: true },
  });
  const messages = historyRows.map((r) => ({
    role: r.role as "user" | "assistant" | "system",
    content: r.content,
  }));

  const sessionMeta = async () => {
    const row = await prisma.userChatSession.findUnique({
      where: { id: session.id },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return row ? toSessionMeta(row) : toSessionMeta(session);
  };

  try {
    const result = await runChatAgent({
      userId,
      messages,
      maxToolRounds: 3,
      providerId,
    });

    await prisma.userChatMessage.create({
      data: {
        sessionId: session.id,
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
      sessionId: session.id,
      session: await sessionMeta(),
      assistantMeta: result.assistantMeta ?? null,
    };
  } catch (e) {
    const reason = explainAIError(e);
    const failContent = `对话失败：${reason}`;
    await prisma.userChatMessage.create({
      data: {
        sessionId: session.id,
        role: "assistant",
        content: failContent,
      },
    });
    return {
      kind: "error",
      reason,
      sessionId: session.id,
      failContent,
      session: await sessionMeta(),
    };
  }
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
