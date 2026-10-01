#!/usr/bin/env node
/**
 * 生成入库用的加密密码（与 server/utils/common.ts 中 encryptBySHA256 一致）。
 *
 * 算法：SHA-256(用户名 + 明文密码) → 小写十六进制字符串。
 * 注意：本项目密码存储不依赖独立「密钥」；拼接顺序为 username 在前、password 在后。
 *
 * 用法（任选其一）：
 *   set JIMILY_USERNAME=testuser
 *   set JIMILY_PASSWORD=test123456
 *   node scripts/generate-password-hash.mjs
 *
 *   node scripts/generate-password-hash.mjs testuser test123456
 *
 * 或直接改下面 DEFAULT_USERNAME / DEFAULT_PASSWORD 后运行。
 * （勿用 USERNAME 环境变量：Windows 系统自带该变量，会覆盖配置。）
 */
import crypto from "node:crypto";

/** 默认测试账号（请勿把真实生产密码提交到仓库） */
const DEFAULT_USERNAME = "jimilydemo";
const DEFAULT_PASSWORD = "jimilydemo";

/**
 * 与 server/utils/common.ts encryptBySHA256 保持一致
 * @param {string} userName
 * @param {string} password
 */
function encryptBySHA256(userName, password) {
  const hash = crypto.createHash("sha256");
  hash.update(userName + password);
  return hash.digest("hex");
}

function usage() {
  console.log(`用法:
  node scripts/generate-password-hash.mjs [用户名] [明文密码]

环境变量:
  JIMILY_USERNAME  登录用户名
  JIMILY_PASSWORD  明文密码

示例:
  node scripts/generate-password-hash.mjs admin admin123456
`);
}

const username = (
  process.env.JIMILY_USERNAME ||
  process.argv[2] ||
  DEFAULT_USERNAME ||
  ""
).trim();

const plainPassword =
  process.env.JIMILY_PASSWORD ||
  process.argv[3] ||
  DEFAULT_PASSWORD ||
  "";

if (!username || !plainPassword) {
  console.error("错误：用户名与明文密码均不能为空。");
  usage();
  process.exit(1);
}

const hashed = encryptBySHA256(username, plainPassword);

console.log("—".repeat(48));
console.log("Jimily 密码哈希（用于 users.password 字段）");
console.log("—".repeat(48));
console.log("用户名:     ", username);
console.log("明文密码:   ", plainPassword);
console.log("拼接输入:   ", `${username}${plainPassword}`);
console.log("加密结果:   ", hashed);
console.log("");
console.log("说明：登录/注册/改密均使用上述算法；数据库中应保存「加密结果」，登录时仍传明文密码。");
console.log("");
console.log("示例 SQL（请按实际 id、角色等调整）：");
console.log(
  `INSERT INTO users (username, password, name, roles)
VALUES ('${username.replace(/'/g, "''")}', '${hashed}', '测试用户', 'user');`,
);
