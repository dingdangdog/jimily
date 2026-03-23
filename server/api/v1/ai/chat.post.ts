import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { runPersistedUserChat } from "~~/server/lib/ai/user-chat-service";

function parseConversationId(body: Record<string, unknown>): number | null {
  const raw = body.conversationId ?? body.sessionId;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isNaN(n) ? null : n;
}

/**
 * @swagger
 * /api/v1/ai/chat:
 *   post:
 *     summary: 发送用户消息并获取 AI 回复（持久化，与网页 Jimi 同源）
 *     description: |
 *       鉴权：Cookie 登录或 Authorization Bearer（用户 API 令牌）。
 *       成功时 d 含 content、conversationId、conversation；
 *       AI 失败时 c=500，d 仍可能含 conversationId、content（失败说明）、conversation。
 *     tags: ["AI 接口（v1）"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AiV1ChatRequest'
 *     responses:
 *       200:
 *         description: 成功
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     d:
 *                       $ref: '#/components/schemas/AiV1ChatData'
 *       400:
 *         description: 参数错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 *       500:
 *         description: AI 或业务失败（d 可能仍含会话信息）
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     d:
 *                       $ref: '#/components/schemas/AiV1ChatData'
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未授权或 token 无效");
  }

  const body = (await readBody(event).catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (body?.content == null || typeof body.content !== "string") {
    return error("请提供 content 字段（字符串）");
  }

  const content = body.content.trim();
  if (!content) {
    return error("请输入内容");
  }

  const cid = parseConversationId(body);
  const providerId =
    body.providerId != null && typeof body.providerId === "string"
      ? body.providerId.trim() || undefined
      : undefined;

  const persisted = await runPersistedUserChat({
    userId,
    sessionId: cid,
    content,
    providerId,
  });

  const payload = {
    content:
      persisted.kind === "ok" ? persisted.content : persisted.failContent,
    conversationId: persisted.sessionId,
    conversation: persisted.session,
  };

  if (persisted.kind === "ok") {
    return success(payload);
  }
  return error(persisted.reason, payload);
});
