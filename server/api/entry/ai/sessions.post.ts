import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { createUserChatSession } from "~~/server/lib/ai/user-chat-service";

/** POST /api/entry/ai/sessions - 创建新对话会话 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未授权或 token 无效");
  }

  const body = await readBody(event).catch(() => ({}));
  const title =
    body?.title !== undefined
      ? typeof body.title === "string"
        ? body.title.trim().slice(0, 200) || null
        : null
      : undefined;

  const session = await createUserChatSession(userId, title);
  return success(session);
});
