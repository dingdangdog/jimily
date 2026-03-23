# 012 — API 文档页改为 Scalar 一键渲染

## 变更说明

- 依赖：新增 `@scalar/api-reference`，在 `app/pages/api-docs.vue` 中用 `ApiReference` 加载同源的 `/api/openapi.json`，替代原先手写列表 + JSON 展示。
- 页面仍使用 `layout: false` 全屏展示；保留顶部主题切换按钮，并与 Scalar 的 `darkMode` 对齐（切换时通过 `key` 重新挂载文档组件）。
- `ApiReference` 使用 `defineAsyncComponent` 异步加载，避免把 Scalar 打进所有页面的首包；`Suspense` 提供简短加载提示。

## 如何验证效果

1. 安装依赖（若尚未执行）：在项目根目录运行 `pnpm install`。
2. 启动开发服务：`pnpm dev`（默认端口见 `nuxt.config.ts` 中 `devServer.port`，当前为 `9090`）。
3. 浏览器打开：`http://localhost:9090/api-docs`。
4. 确认左侧为 Scalar 导航、可展开各 Tag/路径；右侧为请求/响应说明；可尝试 Scalar 自带的「试调」能力（若 spec 中服务器地址与当前环境一致）。
5. 可选：直接访问 `http://localhost:9090/api/openapi.json` 确认返回 JSON，与 Scalar 数据源一致。
6. 生产构建自检：`pnpm build` 后 `pnpm preview`，再次打开 `/api-docs` 确认无白屏与控制台报错。
