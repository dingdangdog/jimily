import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { getUserChatSessionForUser } from "~~/server/lib/ai/user-chat-service";

/**
 * @swagger
 * /api/v1/ai/conversations/{id}:
 *   get:
 *     summary: 获取指定对话元数据
 *     tags: ["AI 接口（v1）"]
 *     security:
 *       - Authorization: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: 对话 ID
 *     responses:
 *       200:
 *         description: 成功，d.conversation
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: object 含 conversation
 *       400:
 *         description: 参数无效
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未授权或 token 无效");
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    return error("缺少对话 ID");
  }

  const conversationId = Number(id);
  if (Number.isNaN(conversationId)) {
    return error("无效的对话 ID");
  }

  const conversation = await getUserChatSessionForUser(
    userId,
    conversationId,
  );
  if (!conversation) {
    return error("对话不存在或无权访问");
  }

  return success({ conversation });
});
