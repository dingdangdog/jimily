import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { listUserChatMessages } from "~~/server/lib/ai/user-chat-service";

/** GET /api/entry/ai/sessions/:id/messages - 获取指定会话的消息列表 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未登录或登录失效");
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    return error("缺少会话 ID");
  }

  const sessionId = Number(id);
  if (Number.isNaN(sessionId)) {
    return error("无效的会话 ID");
  }

  const messages = await listUserChatMessages(userId, sessionId);
  if (messages === null) {
    return error("会话不存在或无权访问");
  }

  return success(messages);
});
