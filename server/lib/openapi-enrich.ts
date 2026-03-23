/**
 * 将 swagger-jsdoc 合并结果中「非标准 JSON Schema」的占位块替换为可渲染的 $ref，
 * 避免 Scalar 中请求/响应体一片空白或解析异常。
 */

const JSON_SCHEMA_KEYS = new Set([
  "type",
  "properties",
  "items",
  "required",
  "additionalProperties",
  "description",
  "title",
  "example",
  "examples",
  "default",
  "enum",
  "format",
  "nullable",
  "allOf",
  "oneOf",
  "anyOf",
  "not",
  "$ref",
  "readOnly",
  "writeOnly",
  "deprecated",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "pattern",
  "multipleOf",
  "minItems",
  "maxItems",
  "uniqueItems",
  "discriminator",
]);

function shouldReplaceSchema(schema: unknown): boolean {
  if (schema == null) return true;
  if (typeof schema !== "object" || Array.isArray(schema)) return true;
  const s = schema as Record<string, unknown>;
  const keys = Object.keys(s);
  if (keys.length === 0) return true;

  if (s.$ref) return false;
  if (s.allOf || s.oneOf || s.anyOf) return false;

  const t = s.type;
  if (t === "array") {
    return !s.items;
  }
  if (t === "object") {
    const props = s.properties as Record<string, unknown> | undefined;
    if (props && Object.keys(props).length > 0) {
      for (const key of Object.keys(props)) {
        const v = props[key];
        if (typeof v === "string") return true;
        if (v && typeof v === "object" && !isValidSubSchema(v)) return true;
      }
      return false;
    }
    if (s.additionalProperties !== undefined) return false;
    // 仅 type + description 的占位 schema（如 openapi.json 自身说明）保留
    if (typeof s.description === "string" && keys.length <= 3) {
      return false;
    }
    return true;
  }
  if (
    t === "string" ||
    t === "number" ||
    t === "integer" ||
    t === "boolean"
  ) {
    return false;
  }

  const nonStd = keys.filter((k) => !JSON_SCHEMA_KEYS.has(k));
  return nonStd.length > 0;
}

function isValidSubSchema(v: unknown): boolean {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  if (o.$ref) return true;
  if (typeof o.type === "string") return true;
  if (o.properties && typeof o.properties === "object") return true;
  if (o.allOf || o.oneOf || o.anyOf) return true;
  if (o.items) return true;
  return false;
}

export function enrichOpenApiSpec(spec: Record<string, unknown>): Record<string, unknown> {
  const out = spec;
  if (!out.openapi) out.openapi = "3.0.3";

  const paths = out.paths as Record<string, unknown> | undefined;
  if (!paths) return out;

  for (const pathKey of Object.keys(paths)) {
    const pathItem = paths[pathKey] as Record<string, unknown>;
    for (const method of Object.keys(pathItem)) {
      if (
        method === "parameters" ||
        method === "servers" ||
        method.startsWith("x-")
      ) {
        continue;
      }
      const op = pathItem[method] as Record<string, unknown> | undefined;
      if (!op || typeof op !== "object") continue;

      const reqJson = op.requestBody as Record<string, unknown> | undefined;
      const content = reqJson?.content as Record<string, unknown> | undefined;
      const jsonBody = content?.["application/json"] as
        | Record<string, unknown>
        | undefined;
      if (jsonBody && shouldReplaceSchema(jsonBody.schema)) {
        jsonBody.schema = { $ref: "#/components/schemas/GenericJsonRequest" };
      }

      const responses = op.responses as Record<string, unknown> | undefined;
      if (!responses) continue;
      for (const code of Object.keys(responses)) {
        const res = responses[code] as Record<string, unknown>;
        const resContent = res?.content as Record<string, unknown> | undefined;
        const resJson = resContent?.["application/json"] as
          | Record<string, unknown>
          | undefined;
        if (resJson && shouldReplaceSchema(resJson.schema)) {
          resJson.schema = { $ref: "#/components/schemas/ApiEnvelope" };
        }
      }
    }
  }

  return out;
}
