# 017 — OpenAPI 请求/响应 schema 规范化

## 问题

原先 `components.schemas` 与各接口注释里的「伪 YAML」（如 `username: string 用户名`）**不是**合法 JSON Schema，Scalar 难以渲染字段表，Models 区也几乎不可用。

## 方案

1. **`server/lib/openapi-component-schemas.ts`**  
   用标准 OpenAPI 3.0 `type` / `properties` / `description` / `$ref` 重写原 `swagger.config` 中的 DTO 与领域模型，并新增：
   - **ApiEnvelope**：全站 `{ c, m, d }` 信封说明；
   - **GenericJsonRequest**：尚未逐接口细化时的请求体兜底；
   - **AiV1ChatRequest**、**AiV1ChatData**：v1 AI 对话示例。

2. **`swagger.config.ts`**  
   改为 `openapi: "3.0.3"`，`components.schemas` 全部引用上述模块；`info.description` 补充信封与兜底说明。

3. **`server/lib/openapi-enrich.ts` + `openapi.json.ts`**  
   在 `swaggerJsdoc()` 合并结果上后处理：对仍为「非标准 schema」的 `application/json` 请求/响应，分别替换为 `$ref: GenericJsonRequest` 与 `$ref: ApiEnvelope`，避免空白或解析异常。

4. **示例性精确声明**  
   `POST /api/login`、`POST /api/v1/ai/chat` 已改为 `$ref` / `allOf` 组合，可作为后续接口注释的写法模板。

## 后续如何细化

对重要接口，在 `@swagger` 里将 `schema` 写成 `$ref: '#/components/schemas/某 DTO'`，并在 `openapi-component-schemas.ts` 中补充该 DTO，即可在 Scalar 中看到完整字段表，而不会被 enrich 覆盖。
