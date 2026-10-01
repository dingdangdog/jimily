import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { listUserChatMessages } from "~~/server/lib/ai/user-chat-service";

/**
 * @swagger
 * /api/v1/ai/conversations/{id}/messages:
 *   get:
 *     summary: 拉取对话下的消息列表
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
 *         description: 成功，d 含 conversationId、messages
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: object 含 conversationId、messages
 *       400:
 *         description: 对话不存在或无权访问
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

  const messages = await listUserChatMessages(userId, conversationId);
  if (messages === null) {
    return error("对话不存在或无权访问");
  }

  return success({ conversationId, messages });
});
