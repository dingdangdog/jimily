import prisma from "~~/server/lib/prisma";
import { parseDateBoundary } from "~~/server/utils/db/flow";

/**
 * @swagger
 * /api/entry/analytics/common:
 *   post:
 *     summary: 获取通用图表分析数据
 *     tags: ["统计分析"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             groupBy: string 分组字段（fundAccount/industryType/attribution）
 *             flowType: string 流水类型（可选）
 *             startDay: string 开始日期（可选）
 *             endDay: string 结束日期（可选）
 *     responses:
 *       200:
 *         description: 通用图表分析数据获取成功
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: [] #[CommonChartData图表通用数据结构：分析数据数组]
 *       400:
 *         description: 获取失败
 *         content:
 *           application/json:
 *             schema:
 *               Error: {
 *                 message: "不支持的分组字段"
 *               }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event); // 获取查询参数

  const allowedGroupFields = ["fundAccount", "industryType", "attribution"];
  if (!body.groupBy || !allowedGroupFields.includes(body.groupBy)) {
    return error("不支持的分组字段");
  }

  const userId = await getUserId(event);
  const where: any = { userId };

  if (body.flowType) {
    where.flowType = {
      equals: body.flowType,
    };
  }

  if (body.startDay && body.endDay) {
    where.day = {
      gte: parseDateBoundary(String(body.startDay), "start"),
      lte: parseDateBoundary(String(body.endDay), "end"),
    };
  } else if (body.startDay) {
    where.day = {
      gte: parseDateBoundary(String(body.startDay), "start"),
    };
  } else if (body.endDay) {
    where.day = {
      lte: parseDateBoundary(String(body.endDay), "end"),
    };
  }

  if (body.groupBy === "fundAccount") {
    const dayGroups = await prisma.flow.groupBy({
      by: ["accountId", "flowType"],
      _sum: {
        money: true,
      },
      orderBy: [
        {
          accountId: "asc",
        },
        {
          flowType: "asc",
        },
      ],
      where,
    });

    const ids = Array.from(
      new Set(
        dayGroups
          .map((g) => g.accountId)
          .filter((id): id is number => id != null && Number.isFinite(id)),
      ),
    );
    const accounts =
      ids.length > 0
        ? await prisma.fundAccount.findMany({
            where: { userId, id: { in: ids } },
            select: { id: true, name: true },
          })
        : [];
    const idToName = new Map(accounts.map((a) => [a.id, a.name] as const));

    const groupedByField: Record<
      string,
      {
        type: string;
        accountId: number | null;
        inSum: number;
        outSum: number;
        zeroSum: number;
      }
    > = {};

    for (const item of dayGroups) {
      const aid = item.accountId;
      const typeLabel =
        aid == null
          ? "未关联账户"
          : idToName.get(aid) || `账户#${aid}`;
      const key = `${aid ?? "null"}`;
      const flowType = item.flowType;
      const raw = item._sum.money || 0;
      const moneySum =
        flowType === "收入" || flowType === "支出" ? Math.abs(raw) : raw;

      if (!groupedByField[key]) {
        groupedByField[key] = {
          type: typeLabel,
          accountId: aid,
          inSum: 0,
          outSum: 0,
          zeroSum: 0,
        };
      }

      if (flowType === "收入") {
        groupedByField[key].inSum += moneySum;
      } else if (flowType === "支出") {
        groupedByField[key].outSum += moneySum;
      } else if (flowType === "不计收支") {
        groupedByField[key].zeroSum += moneySum;
      }
    }

    const datas = Object.values(groupedByField);
    return success(datas);
  }

  const dayGroups = await prisma.flow.groupBy({
    by: [body.groupBy, "flowType"],
    _sum: {
      money: true,
    },
    orderBy: [
      {
        [body.groupBy]: "asc",
      },
      {
        flowType: "asc",
      },
    ],
    where,
  });

  const datas: Array<{
    type: string;
    accountId?: number | null;
    inSum: number;
    outSum: number;
    zeroSum: number;
  }> = [];
  const groupedByField: Record<
    string,
    {
      type: string;
      inSum: number;
      outSum: number;
      zeroSum: number;
    }
  > = {};

  dayGroups.reduce((acc, item) => {
    let fieldValue = item[body.groupBy as keyof typeof item] as string;
    if (!fieldValue) {
      fieldValue = "未知";
    }
    const flowType = item.flowType;
    const raw = item._sum.money || 0;
    const moneySum =
      flowType === "收入" || flowType === "支出" ? Math.abs(raw) : raw;

    if (!acc[fieldValue]) {
      acc[fieldValue] = {
        type: fieldValue,
        inSum: 0,
        outSum: 0,
        zeroSum: 0,
      };
    }

    if (flowType === "收入") {
      acc[fieldValue].inSum += moneySum;
    } else if (flowType === "支出") {
      acc[fieldValue].outSum += moneySum;
    } else if (flowType === "不计收支") {
      acc[fieldValue].zeroSum += moneySum;
    }

    return acc;
  }, groupedByField);

  for (const fieldValue in groupedByField) {
    datas.push(groupedByField[fieldValue]);
  }

  return success(datas);
});
