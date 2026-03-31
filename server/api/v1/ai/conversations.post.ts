import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { createUserChatSession } from "~~/server/lib/ai/user-chat-service";

/**
 * @swagger
 * /api/v1/ai/conversations:
 *   post:
 *     summary: 主动创建空对话
 *     description: 鉴权同 GET conversations。请求体可选 title。
 *     tags: ["AI 接口（v1）"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             title: string 对话标题（可选，最长约 200 字符）
 *     responses:
 *       200:
 *         description: 成功，d.conversation 为新建会话
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: object 含 conversation
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未登录或登录失效");
  }

  const body = await readBody(event).catch(() => ({}));
  const title =
    body?.title !== undefined
      ? typeof body.title === "string"
        ? body.title.trim().slice(0, 200) || null
        : null
      : undefined;

  const conversation = await createUserChatSession(userId, title);
  return success({ conversation });
});
