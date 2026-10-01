// 在 nuxt build 前写入 public/openapi.json；生产镜像无 server/api 源码，运行时 swagger-jsdoc 无法扫注释。
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import swaggerJsdoc from "swagger-jsdoc";
import options from "../swagger.config";
import { enrichOpenApiSpec } from "../server/lib/openapi-enrich";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function generateOpenApiStatic() {
  const spec = enrichOpenApiSpec(swaggerJsdoc(options) as Record<string, unknown>);
  const dir = join(root, "public");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "openapi.json"), `${JSON.stringify(spec, null, 2)}\n`, "utf8");
}
