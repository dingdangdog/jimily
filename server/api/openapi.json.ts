// GET /api/openapi.json — 合并后的 OpenAPI 规范（Scalar /api-docs、Postman 等依赖此地址，勿删）
import swaggerJsdoc from "swagger-jsdoc";
import options from "../../swagger.config";
import { enrichOpenApiSpec } from "../lib/openapi-enrich";

let swaggerSpec: any;

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
    swaggerSpec = enrichOpenApiSpec(swaggerJsdoc(options) as Record<string, unknown>);
  }
  // 设置响应头为 JSON
  setHeader(event, "Content-Type", "application/json");
  return swaggerSpec;
});
