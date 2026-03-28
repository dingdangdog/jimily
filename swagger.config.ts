// swagger.config.ts
import type { Options } from "swagger-jsdoc";
import { openApiComponentSchemas } from "./server/lib/openapi-component-schemas";

const swaggerDefinition = {
  openapi: "3.0.3",
  info: {
    title: "Jimily API",
    version: "5.1.0",
    description: [
      "接口文档由 swagger-jsdoc 从注释合并生成，并已做 schema 规范化；仍可能与实现略有出入，请以实际响应为准。",
      "",
      "**响应信封**：多数 JSON 接口返回 `{ c, m, d }`（见 Models 中的 **ApiEnvelope**）。`c=200` 表示成功；`400` 未登录或无权限等；`500` 业务失败。",
      "",
      "**请求体**：未单独声明的接口在文档中可能显示为 **GenericJsonRequest**（任意 JSON 字段），具体字段可对照源码或下方 DTO（如 Flow、CreateFlowDto）。",
    ].join("\n"),
  },
  servers: [
    {
      url: "http://localhost:9090",
      description: "请以你的服务器地址为准",
    },
  ],
  /**
   * 顶层 tags 顺序会被 Scalar / Swagger UI 等用作侧栏分组顺序。
   * 未在此列出的 tag 一般会排在后面（实现相关）。
   */
  tags: [
    { name: "基础", description: "登录、注册、站点配置、健康检查与 OpenAPI 规范入口" },
    { name: "用户", description: "当前用户信息、密码、API 访问令牌" },
    { name: "管理后台", description: "管理员登录与登出" },
    {
      name: "AI 接口（v1）",
      description: "对外稳定的 AI 对话 REST API（与站内会话同源数据）",
    },
    { name: "流水", description: "收支流水：增删改查、分页、导入与关联转换" },
    { name: "流水分类", description: "流水分类、行业类型等类型字典维护" },
    { name: "固定流水", description: "固定（周期性）流水" },
    { name: "预算", description: "预算" },
    { name: "应收", description: "应收及与流水转换" },
    { name: "发票", description: "流水关联发票上传、查看与清理" },
    { name: "统计分析", description: "统计与图表分析" },
    { name: "类型映射", description: "外部类别与系统类别的映射关系" },
    { name: "导入候选", description: "导入流水候选确认、忽略与批量处理" },
    { name: "去重", description: "流水去重" },
    { name: "测试", description: "开发/联调用测试接口" },
  ],
  components: {
    schemas: openApiComponentSchemas,
  },
};

const options: Options = {
  swaggerDefinition,
  apis: ["./server/api/**/*.ts", "./server/routes/**/*.ts"],
};

export default options;
