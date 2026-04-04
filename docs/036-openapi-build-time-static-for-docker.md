# 036：Docker / 生产环境 OpenAPI 文档空白 — 构建期生成静态规范

## 现象

`/api-docs`（Scalar）在开发环境能完整展示路径与参数；打包为 Docker 部署后往往只剩侧栏「模块名」（tags），具体接口与参数缺失。

## 原因

OpenAPI 由 `swagger-jsdoc` 在 **`server/api/openapi.json` 运行时** 根据 `swagger.config.ts` 里的 glob（`./server/api/**/*.ts` 等）读取 **磁盘上的 TypeScript 源码** 与 `@swagger` 注释合并生成。

Docker 运行阶段只包含 **Nitro 构建产物**（`.output`），**不包含** `server/api` 下原始 `.ts` 文件；工作目录下也没有这些路径，glob 匹配为空，合并结果里几乎只有 `swaggerDefinition` 中的顶层信息（如 `tags`），`paths` 严重缺失，Scalar 只能渲染分组标题。

开发环境工程目录完整，故表现正常。

## 处理

1. 在 **`nuxt build` 前**（`build:before` 钩子）执行 `scripts/generate-openapi.ts`，用与线上一致的 `swagger-jsdoc` + `enrichOpenApiSpec` 生成 **`public/openapi.json`**。构建会把 `public/` 复制进 `.output/public/`。
2. **`server/api/openapi.json`**：在非开发环境（`!import.meta.dev`）且存在 `process.cwd()/public/openapi.json` 时 **直接返回该文件内容**；开发环境仍走运行时 `swagger-jsdoc`，便于改注释即刷新。

无需在开发机单独「导出给正式用」手工拷贝；**正式镜像只要在构建阶段跑完整 `pnpm build` 即可** 自动生成并打入产物。

## 注意

- 若生产启动时缺少 `public/openapi.json`（例如未完整 build、或误删 `.output/public`），会回退到运行时 jsdoc，在 Docker 中仍会缺路径。
- 历史遗留的 `public/openapi.json`（若曾与当前注释体系不一致）会在下次 `pnpm build` 时被覆盖为构建期生成结果。
