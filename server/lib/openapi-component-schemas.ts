/**
 * OpenAPI 3.0 components.schemas（合法 JSON Schema 形态），供 Scalar 等渲染请求/响应与 Models。
 * 说明见 docs/017-openapi-envelope-and-schemas.md
 */

const S = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "string" as const,
  description,
  ...extra,
});

const N = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "number" as const,
  description,
  ...extra,
});

const I = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "integer" as const,
  description,
  ...extra,
});

const B = (description: string, extra: Record<string, unknown> = {}) => ({
  type: "boolean" as const,
  description,
  ...extra,
});

/** 全站统一响应信封，与 server/utils/common success/error 一致 */
const ApiEnvelope = {
  type: "object" as const,
  required: ["c"],
  description:
    "统一响应：c 为业务码，m 为提示/错误文案，d 为载荷（结构随接口变化，失败时也可能带部分字段）",
  properties: {
    c: {
      type: "integer",
      description: "200 成功；400 未登录、无权限或参数错误；500 业务/系统失败",
      enum: [200, 400, 500],
      example: 200,
    },
    m: {
      type: "string",
      description: "提示或错误信息；成功时多为空字符串",
      example: "",
    },
    d: {
      description:
        "业务数据：多为对象；部分接口为数组或 null，请以实际响应为准",
      nullable: true,
      type: "object",
      additionalProperties: true,
    },
  },
};

export const openApiComponentSchemas: Record<string, unknown> = {
  ApiEnvelope,

  LoginParam: {
    type: "object",
    required: ["username", "password"],
    properties: {
      username: S("登录用户名"),
      password: S("密码"),
    },
  },

  Result: { $ref: "#/components/schemas/ApiEnvelope" },

  Page: {
    type: "object",
    description: "通用分页结构（部分接口的 d）",
    properties: {
      pageNum: I("当前页码"),
      pageSize: I("每页条数"),
      pages: I("总页数"),
      total: I("总条数"),
      totalOut: N("总支出金额（部分接口）"),
      totalIn: N("总收入金额（部分接口）"),
      notInOut: N("不计收支金额（部分接口）"),
      data: {
        type: "array",
        description: "当前页数据",
        items: {},
      },
    },
  },

  /** 资金账户摘要（list/page/all 在 Flow 上附加的 account 字段） */
  FlowAccountBrief: {
    type: "object",
    properties: {
      id: I("资金账户 ID"),
      name: S("账户名称"),
    },
  },

  /** POST /api/entry/flow/page 成功时 d 的结构 */
  FlowPagePayload: {
    type: "object",
    description: "流水分页结果（含条件范围内汇总）",
    properties: {
      total: I("符合条件的总条数"),
      pages: I("总页数（pageSize=-1 查全部时仍返回）"),
      totalIn: N("当前条件下收入类金额合计"),
      totalOut: N("当前条件下支出类金额合计"),
      notInOut: N("当前条件下不计收支金额合计"),
      data: {
        type: "array",
        items: { $ref: "#/components/schemas/FlowWithAccount" },
        description: "当前页流水行",
      },
    },
  },

  /** 批量删除 Prisma deleteMany 结果，作为信封的 d */
  FlowBatchDeletePayload: {
    type: "object",
    properties: {
      count: I("实际删除条数"),
    },
  },

  PageParam: {
    type: "object",
    properties: {
      pageNum: I("页码，默认 1"),
      pageSize: I("每页条数，默认 20"),
    },
  },

  UserInfo: {
    type: "object",
    properties: {
      id: I("用户 ID"),
      name: S("昵称"),
      username: S("用户名"),
      createDate: S("创建日期"),
    },
  },

  MonthAnalysis: {
    type: "object",
    properties: {
      month: S("月份 YYYY-MM"),
      outSum: S("总支出"),
      inSum: S("总收入"),
      zeroSum: S("总不计收支"),
      maxInType: S("最大收入类型"),
      maxInTypeSum: S("最大收入金额"),
      maxOutType: S("最大支出类型"),
      maxOutTypeSum: S("最大支出金额"),
      maxOut: { $ref: "#/components/schemas/Flow" },
      maxIn: { $ref: "#/components/schemas/Flow" },
      maxZero: { $ref: "#/components/schemas/Flow" },
    },
  },

  /**
   * POST /api/entry/flow/add 请求体（与 handler 读取字段一致）。
   * flowType 存库为中文：收入、支出、不计收支。
   */
  CreateFlowDto: {
    type: "object",
    description: "新建流水；day 不传则服务端用当前时间",
    properties: {
      day: S("发生日期（可解析的日期字符串；不传为当前时间）"),
      flowType: S("流水类型：收入、支出、不计收支（与界面/数据库一致）"),
      industryType: S("行业/分类（支出类型或收入类型）"),
      name: S("条目名称/摘要"),
      money: N("金额；类型为收入/支出时服务端取绝对值"),
      description: S("备注说明"),
      attribution: S("流水归属"),
      accountId: I("关联资金账户 ID；不传或 null 表示不关联", { nullable: true }),
      accountDelta: N(
        "可选；与资金账户联动时的余额变动增量（参与 resolveFlowAccountDelta）",
        { nullable: true },
      ),
    },
  },

  /** POST /api/entry/flow/update 请求体 */
  UpdateFlowDto: {
    type: "object",
    required: ["id"],
    description: "更新流水；除 id 外字段均可按需部分提交",
    properties: {
      id: I("要更新的流水 ID"),
      day: S("发生日期"),
      flowType: S("流水类型：收入、支出、不计收支"),
      industryType: S("行业/分类"),
      name: S("条目名称"),
      money: N("金额"),
      description: S("备注"),
      attribution: S("归属"),
      accountId: I("资金账户 ID；传 null 可解除关联", { nullable: true }),
      accountDelta: N("可选；账户余额变动增量", { nullable: true }),
    },
  },

  /** POST /api/entry/flow/list 筛选条件（无分页字段） */
  FlowListFilter: {
    type: "object",
    description: "列表查询条件，均为可选，组合 AND",
    properties: {
      id: I("按流水 ID 精确匹配"),
      flowType: S("流水类型精确匹配"),
      industryType: S("行业/分类精确匹配"),
      accountId: I("资金账户 ID 精确匹配"),
      startDay: S("日期下限（含）；常与 endDay 同用"),
      endDay: S("日期上限（含）"),
      name: S("名称模糊匹配"),
      attribution: S("归属模糊匹配"),
      description: S("备注模糊匹配"),
      minMoney: N("金额下限"),
      maxMoney: N("金额上限"),
    },
  },

  /** POST /api/entry/flow/page 筛选 + 分页 */
  FlowPageFilter: {
    allOf: [
      { $ref: "#/components/schemas/FlowListFilter" },
      {
        type: "object",
        properties: {
          accountUnassigned: B("为 true 时仅返回未关联资金账户的流水"),
          pageNum: I("页码，默认 1"),
          pageSize: I("每页条数，默认 15；-1 表示不分页取全部"),
          moneySort: S("金额排序：asc 或 desc；会作为首要排序键"),
        },
      },
    ],
  },

  /** POST /api/entry/flow/del 请求体 */
  FlowIdBody: {
    type: "object",
    required: ["id"],
    properties: {
      id: I("流水 ID"),
    },
  },

  /** POST /api/entry/flow/dels 请求体 */
  FlowIdsBody: {
    type: "object",
    required: ["ids"],
    properties: {
      ids: {
        type: "array",
        items: { type: "integer" },
        description: "待删除的流水 ID 列表",
      },
    },
  },

  /** 图表等用的通用查询（含分页字段）；与 FlowPageFilter 类似用途 */
  FlowQuery: {
    type: "object",
    properties: {
      pageNum: I("页码"),
      pageSize: I("每页大小"),
      id: S("流水 ID"),
      startDay: S("查询起始日期"),
      endDay: S("查询结束日期"),
      flowType: S("流水类型"),
      industryType: S("行业类型"),
      accountId: I("资金账户 ID"),
      accountUnassigned: B("仅未关联账户的流水"),
      name: S("名称关键词"),
      attribution: S("归属关键词"),
      description: S("描述关键词"),
      moneySort: S("金额排序 asc/desc"),
      minMoney: N("金额下限"),
      maxMoney: N("金额上限"),
    },
  },

  Server: {
    type: "object",
    properties: {
      version: S("服务器版本"),
      dataPath: S("数据目录"),
      openRegister: B("是否开放注册"),
    },
  },

  AdminLogin: {
    type: "object",
    required: ["account", "password"],
    properties: {
      account: S("管理员账号"),
      password: S("管理员密码"),
    },
  },

  CommonChartQuery: {
    type: "object",
    properties: {
      flowType: S("流水类型"),
      startDay: S("起始日期"),
      endDay: S("结束日期"),
    },
  },

  CommonChartData: {
    type: "object",
    properties: {
      type: S("维度标记，如日期、分类名"),
      inSum: N("收入金额"),
      outSum: N("支出金额"),
      zeroSum: N("不计收支金额"),
      accountId: I("按账户分组时存在", { nullable: true }),
    },
  },

  Typer: {
    type: "object",
    properties: {
      flowType: S("流水类型"),
      type: S("类别名称"),
      value: S("新类别值"),
      oldValue: S("旧类别值（更新时）"),
    },
  },

  CommonSelectOption: {
    type: "object",
    properties: {
      title: S("展示文本"),
      value: S("选项值"),
    },
  },

  SystemSetting: {
    type: "object",
    properties: {
      id: I("设置 ID"),
      title: S("站点标题"),
      description: S("站点描述"),
      keywords: S("关键词"),
      version: S("系统版本号"),
      openRegister: B("是否开放注册"),
      createDate: S("创建日期"),
      updateBy: S("最后更新"),
    },
  },

  User: {
    type: "object",
    properties: {
      id: I("用户 ID"),
      username: S("登录账号"),
      password: S("密码（响应中通常不应返回）"),
      name: S("昵称"),
      email: S("邮箱"),
      createDate: S("创建日期"),
    },
  },

  Flow: {
    type: "object",
    description: "流水实体（与 Prisma Flow 及 JSON 序列化一致）",
    properties: {
      id: I("流水 ID"),
      flowNo: S("流水唯一编号"),
      userId: I("所属用户 ID"),
      accountId: I("关联资金账户 ID", { nullable: true }),
      day: S("发生时间（ISO 8601 字符串）"),
      flowType: S("收入、支出、不计收支"),
      industryType: S("行业/分类", { nullable: true }),
      money: N("金额", { nullable: true }),
      name: S("条目名称", { nullable: true }),
      description: S("备注", { nullable: true }),
      invoice: S("票据/图片路径等", { nullable: true }),
      origin: S("来源说明", { nullable: true }),
      attribution: S("归属", { nullable: true }),
      eliminate: I("平账：0 未平账；1 已平账；-1 忽略", { nullable: true }),
    },
  },

  /** list/page/all 返回时在 Flow 上附加 account */
  FlowWithAccount: {
    allOf: [
      { $ref: "#/components/schemas/Flow" },
      {
        type: "object",
        properties: {
          account: {
            description: "关联账户摘要；无关联时为 null",
            nullable: true,
            allOf: [{ $ref: "#/components/schemas/FlowAccountBrief" }],
          },
        },
      },
    ],
  },

  Budget: {
    type: "object",
    properties: {
      id: I("预算 ID"),
      userId: I("用户 ID"),
      month: S("月份 YYYY-MM"),
      budget: N("预算金额"),
      used: N("已使用金额"),
    },
  },

  FixedFlow: {
    type: "object",
    properties: {
      id: I("固定流水 ID"),
      userId: I("用户 ID"),
      startMonth: S("开始月份"),
      endMonth: S("结束月份"),
      month: S("记录月份"),
      money: N("金额"),
      name: S("名称"),
      description: S("备注"),
      flowType: S("in / out / zero"),
      industryType: S("行业分类"),
      attribution: S("归属"),
    },
  },

  TypeRelation: {
    type: "object",
    properties: {
      id: I("关联 ID"),
      userId: I("用户 ID"),
      source: S("源类别（如导入原始类别）"),
      target: S("目标系统类别"),
    },
  },

  /** 宽松 JSON 请求体占位（兜底时用于尚未细化的接口） */
  GenericJsonRequest: {
    type: "object",
    additionalProperties: true,
    description: "JSON 请求体；字段以各接口业务为准，可参考源码或下方 Models 中的 DTO",
  },

  /** POST /api/v1/ai/chat 请求体 */
  AiV1ChatRequest: {
    type: "object",
    required: ["content"],
    properties: {
      content: S("用户消息"),
      conversationId: I("已有对话 ID；不传或无效则新建", { nullable: true }),
      sessionId: I("与 conversationId 同义", { nullable: true }),
      providerId: S("模型提供商 ID（可选）", { nullable: true }),
    },
  },

  /** v1 AI 单轮回复后 d 的常见字段（成功/失败均可能出现） */
  AiV1ChatData: {
    type: "object",
    description:
      "位于 ApiEnvelope.d；成功时为助手正文；失败时 content 多为错误说明",
    properties: {
      content: S("助手回复或失败说明文案"),
      conversationId: I("对话 ID"),
      conversation: {
        type: "object",
        additionalProperties: true,
        description: "会话元数据 id/title/createdAt/updatedAt 等",
      },
    },
  },
};
