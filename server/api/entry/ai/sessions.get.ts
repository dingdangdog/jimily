import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { listUserChatSessions } from "~~/server/lib/ai/user-chat-service";

/** GET /api/entry/ai/sessions - 获取当前用户的对话会话列表 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未登录或登录失效");
  }

  const sessions = await listUserChatSessions(userId);
  return success(sessions);
});
