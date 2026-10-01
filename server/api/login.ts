import { encryptBySHA256 } from "../utils/common";
import prisma from "~~/server/lib/prisma";
import jwt from "jsonwebtoken";

/**
 * @swagger
 * /api/login:
 *   post:
 *     summary: 用户登录
 *     tags: ["基础"]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginParam'
 *     responses:
 *       200:
 *         description: 登录成功，响应为统一信封 ApiEnvelope，d 中含用户信息及 token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 *       400:
 *         description: 登录失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body.username || !body.password) {
    return error("用户名或密码不能为空");
  }

  const username = String(body.username).trim();
  const password = String(body.password);
  const entryPassword = encryptBySHA256(username, password);

  const user = await prisma.user.findFirst({
    where: { username, password: entryPassword },
  });

  if (!user) {
    return error("用户名或密码错误");
  }

  const secretKey = useRuntimeConfig().authSecret;
  const env = useRuntimeConfig().env;
  const expiresInDays = 30;
  const expiresInSeconds = expiresInDays * 24 * 60 * 60;

  const tokenPayload = {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    roles: user.roles,
  };

  const token = jwt.sign(tokenPayload, secretKey, {
    expiresIn: expiresInSeconds,
  });

  const returnUser = {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    roles: user.roles,
    lightTheme: user.lightTheme,
    darkTheme: user.darkTheme,
    token,
  };

  const isProduction = env == "production";
  console.log("env", env);
  console.log("isProduction", isProduction);
  setCookie(event, "Authorization", token, {
    maxAge: expiresInSeconds,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
  });

  return success(returnUser);
});
