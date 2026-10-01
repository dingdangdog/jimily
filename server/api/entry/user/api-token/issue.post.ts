import prisma from "~~/server/lib/prisma";
import { error, success } from "~~/server/utils/common";
import {
  API_ACCESS_TOKEN_EXPIRY_OPTIONS,
  signUserApiAccessToken,
  type ApiAccessTokenExpiry,
} from "~~/server/utils/api-access-token";

/**
 * @swagger
 * /api/entry/user/api-token/issue:
 *   post:
 *     summary: 为当前登录用户签发 API 访问令牌（仅响应体，不写 Cookie）
 *     tags: ["用户"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             expiry: string 有效期 30d | 360d | forever
 *     responses:
 *       200:
 *         description: 签发成功
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  if (!userId) {
    return error("未授权");
  }

  const body = await readBody(event);
  const expiryRaw = String(body?.expiry ?? "").trim() as ApiAccessTokenExpiry;

  if (body?.userId != null && Number(body.userId) !== userId) {
    return error("只能为当前登录账号生成令牌");
  }

  if (!API_ACCESS_TOKEN_EXPIRY_OPTIONS.includes(expiryRaw)) {
    return error("有效期须为 30d、360d 或 forever");
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      username: true,
      name: true,
      email: true,
      roles: true,
    },
  });

  if (!user) {
    return error("用户不存在");
  }

  const secretKey = useRuntimeConfig().authSecret;
  const { token, expiresAt } = signUserApiAccessToken(
    secretKey,
    {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      roles: user.roles,
    },
    expiryRaw,
  );

  return success({
    token,
    expiresAt: expiresAt?.toISOString() ?? null,
    expiryPreset: expiryRaw,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
    },
  });
});
