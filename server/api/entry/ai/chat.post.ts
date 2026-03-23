import { getUserId } from "~~/server/utils/jwt";
import { runChatAgent } from "~~/server/lib/ai";
import { success, error } from "~~/server/utils/common";
import {
  explainAIError,
  runPersistedUserChat,
} from "~~/server/lib/ai/user-chat-service";

/**
 * AI 对话接口：支持会话记忆与持久化
 * 请求体: { sessionId?: number, content: string } 或兼容旧版 { messages: [{ role, content }] }
 * 未传 sessionId 时会自动创建新会话，并在响应中返回 sessionId。
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未授权或 token 无效");
  }

  const body = await readBody(event).catch(() => ({}));

  // 新格式：sessionId + content（会落库并带历史）
  if (body?.content != null && typeof body.content === "string") {
    const content = body.content.trim();
    if (!content) {
      return error("请输入内容");
    }

    const providerId =
      body.providerId != null && typeof body.providerId === "string"
        ? body.providerId.trim() || undefined
        : undefined;

    const persisted = await runPersistedUserChat({
      userId,
      sessionId: body.sessionId,
      content,
      providerId,
    });

    if (persisted.kind === "ok") {
      return success({
        content: persisted.content,
        sessionId: persisted.sessionId,
        assistantMeta: persisted.assistantMeta ?? undefined,
      });
    }
    return error(persisted.reason, {
      sessionId: persisted.sessionId,
      content: persisted.failContent,
    });
  }

  // 兼容旧格式：messages 数组（不落库）
  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return error("请提供 content 或 messages 数组");
  }

  const valid = messages.every(
    (m: unknown) => m && typeof m === "object" && "role" in m && "content" in m,
  );
  if (!valid) {
    return error("每条消息需包含 role 和 content");
  }

  const providerId =
    body?.providerId != null && typeof body.providerId === "string"
      ? body.providerId.trim() || undefined
      : undefined;

  try {
    const result = await runChatAgent({
      userId,
      messages: messages as Parameters<typeof runChatAgent>[0]["messages"],
      maxToolRounds: 3,
      providerId,
    });

    return success({ content: result.content });
  } catch (e) {
    const reason = explainAIError(e);
    return error(reason);
  }
});
