/** 与 scripts/test-api-token.mjs 一致的探测逻辑（仅用 Bearer，不带 Cookie） */

export interface ApiTokenProbeResult {
  label: string;
  path: string;
  method: string;
  url: string;
  httpOk: boolean;
  status: number;
  body: unknown;
}

export function isBizSuccess(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    (body as { c?: number }).c === 200
  );
}

export function isBizNoPermission(body: unknown): boolean {
  return (
    body !== null &&
    typeof body === "object" &&
    (body as { c?: number }).c === 400
  );
}

export async function probeApiWithBearer(
  baseOrigin: string,
  token: string,
  label: string,
  method: string,
  path: string,
): Promise<ApiTokenProbeResult> {
  const origin = baseOrigin.replace(/\/$/, "");
  const url = `${origin}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      Accept: "application/json",
    },
    credentials: "omit",
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text) as unknown;
  } catch {
    body = text;
  }
  return {
    label,
    path,
    method,
    url,
    httpOk: res.ok,
    status: res.status,
    body,
  };
}

/** 依次探测：普通用户接口、管理员接口、v1 AI 对话列表 */
export async function runApiTokenTestSuite(baseOrigin: string, token: string) {
  const entry = await probeApiWithBearer(
    baseOrigin,
    token,
    "普通用户接口",
    "GET",
    "/api/entry/user/info",
  );
  const admin = await probeApiWithBearer(
    baseOrigin,
    token,
    "管理员接口",
    "GET",
    "/api/admin/config/get",
  );
  const v1AiConversations = await probeApiWithBearer(
    baseOrigin,
    token,
    "v1 AI 对话列表",
    "GET",
    "/api/v1/ai/conversations",
  );
  return { entry, admin, v1AiConversations };
}

export function formatProbeBody(body: unknown): string {
  if (body == null) return String(body);
  if (typeof body === "string") {
    return body.length > 800 ? `${body.slice(0, 800)}…` : body;
  }
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}
