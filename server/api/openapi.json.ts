// GET /api/openapi.json — 合并后的 OpenAPI 规范（Scalar /api-docs、Postman 等依赖此地址，勿删）
import swaggerJsdoc from "swagger-jsdoc";
import options from "../../swagger.config";

let swaggerSpec: any;

/**
 * @swagger
 * /api/openapi.json:
 *   get:
 *     summary: 获取OpenAPI规范文档
 *     tags: ["基础"]
 *     responses:
 *       200:
 *         description: OpenAPI规范文档
 *         content:
 *           application/json:
 *             schema:
 *               Result: {
 *                 d: OpenAPI规范对象
 *               }
 */
export default defineEventHandler((event) => {
  if (!swaggerSpec) {
    swaggerSpec = swaggerJsdoc(options);
  }
  // 设置响应头为 JSON
  setHeader(event, "Content-Type", "application/json");
  return swaggerSpec;
});
