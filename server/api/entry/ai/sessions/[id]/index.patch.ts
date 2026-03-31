import { getUserId } from "~~/server/utils/jwt";
import { success, error } from "~~/server/utils/common";
import { updateUserChatSessionTitle } from "~~/server/lib/ai/user-chat-service";

/** PATCH /api/entry/ai/sessions/:id - 更新会话标题 */
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

  const updated = await updateUserChatSessionTitle(userId, sessionId, title);
  if (!updated) {
    return error("会话不存在或无权访问");
  }

  return success({
    id: updated.id,
    title: updated.title,
    updatedAt: updated.updatedAt,
  });
});
