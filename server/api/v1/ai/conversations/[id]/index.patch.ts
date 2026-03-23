import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { updateUserChatSessionTitle } from "~~/server/lib/ai/user-chat-service";

/**
 * @swagger
 * /api/v1/ai/conversations/{id}:
 *   patch:
 *     summary: 修改对话标题
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             title: string 新标题；传 null 或空字符串可清空
 *     responses:
 *       200:
 *         description: 成功，d.conversation
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: object 含 conversation
 *       400:
 *         description: 缺少 title 或 ID 无效
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

  const body = await readBody(event);
  const title =
    body?.title === null || body?.title === ""
      ? null
      : typeof body?.title === "string"
        ? body.title.trim().slice(0, 200)
        : undefined;

  if (title === undefined) {
    return error("请提供 title 字段");
  }

  const conversation = await updateUserChatSessionTitle(
    userId,
    conversationId,
    title,
  );
  if (!conversation) {
    return error("对话不存在或无权访问");
  }

  return success({ conversation });
});
