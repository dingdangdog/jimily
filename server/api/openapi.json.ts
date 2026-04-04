// GET /api/openapi.json — 合并后的 OpenAPI 规范（Scalar /api-docs、Postman 等依赖此地址，勿删）
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import swaggerJsdoc from "swagger-jsdoc";
import options from "../../swagger.config";
import { enrichOpenApiSpec } from "../lib/openapi-enrich";

let swaggerSpec: any;

function loadOpenApiSpec() {
  // 生产构建会把构建阶段生成的规范打进 .output/public；镜像内无 server/api 源码，swagger-jsdoc 无法扫注释
  const staticPath = join(process.cwd(), "public", "openapi.json");
  if (!import.meta.dev && existsSync(staticPath)) {
    return JSON.parse(readFileSync(staticPath, "utf8")) as Record<string, unknown>;
  }
  return enrichOpenApiSpec(swaggerJsdoc(options) as Record<string, unknown>);
}

/**
 * @swagger
 * /api/openapi.json:
 *   get:
 *     summary: 获取OpenAPI规范文档
 *     tags: ["基础"]
 *     responses:
 *       200:
 *         description: OpenAPI 3.x JSON 文档
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: 完整 OpenAPI 根对象
 */
export default defineEventHandler((event) => {
  if (!swaggerSpec) {
    swaggerSpec = loadOpenApiSpec();
  }
  // 设置响应头为 JSON
  setHeader(event, "Content-Type", "application/json");
  return swaggerSpec;
});
