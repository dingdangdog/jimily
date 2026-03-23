#!/usr/bin/env node
/**
 * 测试「API 访问令牌」对接口的权限表现：
 * 1) 普通用户接口：GET /api/entry/user/info（任意有效登录用户应成功）
 * 2) v1 AI：GET /api/v1/ai/conversations（与 1 相同，验证外部 AI API 可达）
 * 3) 管理员接口：GET /api/admin/config/get（仅 roles 含 admin 的用户应成功）
 *
 * 用法（任选其一）：
 *   set API_TOKEN=你的JWT
 *   set BASE_URL=http://127.0.0.1:3000
 *   node scripts/test-api-token.mjs
 *
 *   node scripts/test-api-token.mjs "eyJhbGciOiJIUzI1NiIs..."
 *
 * 或直接改下面 DEFAULT_BASE_URL / DEFAULT_TOKEN 后运行（请勿把 token 提交到仓库）。
 */
const DEFAULT_BASE_URL = "http://localhost:9090";
const DEFAULT_TOKEN = "";

const base = (
  process.env.BASE_URL ||
  DEFAULT_BASE_URL ||
  "http://127.0.0.1:3000"
).replace(/\/$/, "");
const token = (
  process.env.API_TOKEN ||
  process.argv[2] ||
  DEFAULT_TOKEN ||
  ""
).trim();

const authHeaders = {
  Authorization: `Bearer ${token}`,
  Accept: "application/json",
};

async function callApi(label, method, path) {
  const url = `${base}${path}`;
  const res = await fetch(url, { method, headers: authHeaders });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { label, path, method, url, httpOk: res.ok, status: res.status, body };
}

function formatBody(body) {
  if (body == null) return String(body);
  if (typeof body === "string") return body.slice(0, 500);
  return JSON.stringify(body, null, 2);
}

function isBizSuccess(body) {
  return body && typeof body === "object" && body.c === 200;
}

function isBizNoPermission(body) {
  return body && typeof body === "object" && body.c === 400;
}

if (!token) {
  console.error(
    "未提供 Token。请设置环境变量 API_TOKEN、传入第一个参数，或编辑本文件 DEFAULT_TOKEN。",
  );
  process.exit(1);
}

console.log("站点:", base);
console.log("Token 长度:", token.length);
console.log("");

const entry = await callApi("普通用户接口", "GET", "/api/entry/user/info");
const v1Ai = await callApi("v1 AI 对话列表", "GET", "/api/v1/ai/conversations");
const admin = await callApi("管理员接口", "GET", "/api/admin/config/get");

function printBlock(r) {
  console.log("—".repeat(48));
  console.log(`【${r.label}】 ${r.method} ${r.path}`);
  console.log("URL:", r.url);
  console.log("HTTP:", r.status, r.httpOk ? "ok" : "fail");
  console.log("响应:", formatBody(r.body));
  if (isBizSuccess(r.body)) {
    console.log("判定: 有权限（业务码 c=200）");
    if (r.path.includes("/entry/user/info") && r.body.d) {
      console.log(
        "  当前用户:",
        r.body.d.username,
        "id=",
        r.body.d.id,
        "roles=",
        r.body.d.roles ?? "(无)",
      );
    }
  } else if (isBizNoPermission(r.body)) {
    console.log("判定: 无权限或未授权（业务码 c=400）");
    if (r.body.m) console.log("  服务端说明:", r.body.m);
  } else {
    console.log("判定: 异常（非预期 JSON 或非 200 业务码）");
  }
  console.log("");
}

printBlock(entry);
printBlock(v1Ai);
printBlock(admin);

console.log("—".repeat(48));
console.log("汇总");

const entryOk = isBizSuccess(entry.body);
const v1Ok = isBizSuccess(v1Ai.body);
const adminOk = isBizSuccess(admin.body);
const adminDenied =
  isBizNoPermission(admin.body) &&
  String(admin.body.m || "").includes("管理员");

if (!entryOk) {
  console.log(
    "· Token 无法访问普通用户接口：无效、过期，或站点地址/Base URL 不正确。",
  );
  process.exit(1);
}

console.log("· 普通用户接口：通过（该 Token 至少具备登录用户身份）。");

if (v1Ok) {
  console.log("· v1 AI 对话列表：通过（可调用 /api/v1/ai/conversations）。");
} else {
  console.log(
    "· v1 AI 对话列表：未通过，请检查路由部署或服务日志（普通用户接口已通过时通常应成功）。",
  );
}

if (adminOk) {
  console.log("· 管理员接口：通过（该账号具备 admin 角色，可调用 /api/admin）。");
} else if (adminDenied || isBizNoPermission(admin.body)) {
  console.log(
    "· 管理员接口：拒绝（符合预期：非管理员账号的 Token 不应能调管理端接口）。",
  );
} else {
  console.log(
    "· 管理员接口：未得到明确结果，请根据上方 HTTP/响应体排查。",
  );
}

process.exit(0);
