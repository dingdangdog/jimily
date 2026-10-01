import jwt from "jsonwebtoken";

/** 管理员代发的「仅用于 API（如 Bearer）」访问令牌有效期选项 */
export type ApiAccessTokenExpiry = "30d" | "360d" | "forever";

const DAY_SEC = 24 * 60 * 60;

export const API_ACCESS_TOKEN_EXPIRY_OPTIONS: ApiAccessTokenExpiry[] = [
  "30d",
  "360d",
  "forever",
];

function signOptionsForExpiry(
  expiry: ApiAccessTokenExpiry,
): jwt.SignOptions {
  if (expiry === "forever") return {};
  const days = expiry === "30d" ? 30 : 360;
  return { expiresIn: days * DAY_SEC };
}

/**
 * 签发与用户登录一致的权限载体（id/username/roles 等），供 Authorization: Bearer 调用 /api/entry。
 * 不写 Cookie，与网页登录会话隔离。
 */
export function signUserApiAccessToken(
  secret: string,
  user: {
    id: number;
    username: string;
    name: string;
    email: string | null;
    roles: string | null;
  },
  expiry: ApiAccessTokenExpiry,
): { token: string; expiresAt: Date | null } {
  const payload = {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    roles: user.roles,
    typ: "api_access",
  };
  const token = jwt.sign(payload, secret, signOptionsForExpiry(expiry));
  const decoded = jwt.decode(token) as { exp?: number } | null;
  const expiresAt =
    decoded?.exp != null ? new Date(decoded.exp * 1000) : null;
  return { token, expiresAt };
}
