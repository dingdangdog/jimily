import { noPermissions } from "../utils/common";
import { getAuthPayload, hasAdminRole } from "../utils/jwt";

/** 按路径段匹配前缀，避免 `/api/v1` 误匹配 `/api/v10`、`/api/admin` 误匹配 `/api/administrator` 等 */
function isUnderApiBase(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

function normalizePathname(pathname: string): string {
  if (pathname.length <= 1) return pathname;
  return pathname.replace(/\/+$/, "") || "/";
}

export default defineEventHandler(async (event) => {
  if (event.method === "OPTIONS") return;

  const pathname = normalizePathname(getRequestURL(event).pathname);

  const needsJwt =
    isUnderApiBase(pathname, "/api/entry") ||
    isUnderApiBase(pathname, "/api/v1") ||
    isUnderApiBase(pathname, "/api/admin");

  if (!needsJwt) return;

  const payload = getAuthPayload(event);
  if (!payload?.id) {
    return noPermissions("未授权或 token 无效");
  }

  if (isUnderApiBase(pathname, "/api/admin")) {
    if (!hasAdminRole(payload.roles)) {
      return noPermissions("需要管理员权限");
    }
  }
});
