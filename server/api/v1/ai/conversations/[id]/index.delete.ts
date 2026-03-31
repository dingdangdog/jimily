import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { deleteUserChatSession } from "~~/server/lib/ai/user-chat-service";

/**
 * @swagger
 * /api/v1/ai/conversations/{id}:
 *   delete:
 *     summary: 删除指定对话
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
 *         description: 成功，d 含 ok、conversationId
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: object 含 ok、conversationId
 *       400:
 *         description: ID 无效或无权访问
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未登录或登录失效");
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    return error("缺少对话 ID");
  }

  const conversationId = Number(id);
  if (Number.isNaN(conversationId)) {
    return error("无效的对话 ID");
  }

  const ok = await deleteUserChatSession(userId, conversationId);
  if (!ok) {
    return error("对话不存在或无权访问");
  }

  return success({ ok: true, conversationId });
});
