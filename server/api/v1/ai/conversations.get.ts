import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { listUserChatSessions } from "~~/server/lib/ai/user-chat-service";

/**
 * @swagger
 * /api/v1/ai/conversations:
 *   get:
 *     summary: 列出当前用户的 AI 对话（与网页端会话同源）
 *     description: 鉴权：Cookie 或 Authorization Bearer（用户 API 令牌）
 *     tags: ["AI 接口（v1）"]
 *     security:
 *       - Authorization: []
 *     responses:
 *       200:
 *         description: 成功，d.conversations 为数组
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: object 含 conversations 数组
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未授权或 token 无效");
  }

  const conversations = await listUserChatSessions(userId);
  return success({ conversations });
});
