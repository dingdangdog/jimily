import prisma from "~~/server/lib/prisma";
import { parseDateBoundary } from "~~/server/utils/db/flow";

/**
 * @swagger
 * /api/entry/flow/list:
 *   post:
 *     summary: 获取流水记录列表
 *     tags: ["流水"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             id: number 流水ID（可选）
 *             flowType: string 流水类型（可选）
 *             industryType: string 行业分类（可选）
 *             startDay: string 开始日期（可选）
 *             endDay: string 结束日期（可选）
 *             name: string 流水名称（可选，支持模糊查询）
 *             attribution: string 归属（可选，支持模糊查询）
 *             description: string 描述（可选，支持模糊查询）
 *             minMoney: number 最小金额（可选）
 *             maxMoney: number 最大金额（可选）
 *     responses:
 *       200:
 *         description: 流水记录列表获取成功
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: [] #[Flow流水记录数组]
 *       400:
 *         description: 获取失败
 *         content:
 *           application/json:
 *             schema:
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  const body = await readBody(event); // 获取查询参数

  const where: any = { userId };

  // 添加条件：如果 `name` 存在，则根据 `name` 查询
  if (body.id) {
    // equals 等于查询
    // contains 模糊查询（pgsql和mongo中，可以增加额外参数限制忽略大小写 mode: 'insensitive'）
    where.id = {
      equals: Number(body.id),
    };
  }
  // 类型条件
  if (body.flowType) {
    where.flowType = {
      equals: body.flowType,
    };
  }
  if (body.industryType) {
    where.industryType = {
      equals: body.industryType,
    };
  }
  if (body.accountId !== undefined && body.accountId !== null && body.accountId !== "") {
    where.accountId = {
      equals: Number(body.accountId),
    };
  }

  // 时间条件（日期使用 Date 类型比较）
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

  // 模糊条件
  if (body.name) {
    where.name = {
      contains: body.name,
    };
  }
  if (body.attribution) {
    where.attribution = {
      contains: body.attribution,
    };
  }
  if (body.description) {
    where.description = {
      contains: body.description,
    };
  }

  // 金额范围过滤
  if (
    body.minMoney !== undefined &&
    body.minMoney !== null &&
    body.minMoney !== ""
  ) {
    const min = Number(body.minMoney);
    if (!Number.isNaN(min)) {
      where.money = { ...(where.money || {}), gte: min };
    }
  }
  if (
    body.maxMoney !== undefined &&
    body.maxMoney !== null &&
    body.maxMoney !== ""
  ) {
    const max = Number(body.maxMoney);
    if (!Number.isNaN(max)) {
      where.money = { ...(where.money || {}), lte: max };
    }
  }

  let flows: any[] = await prisma.flow.findMany({
    where, // 使用条件查询
  });

  // 约定式关联资金账户信息（根据 accountId 手动查询并组装 account 字段）
  const accountIds = Array.from(
    new Set(
      flows
        .map((f: any) => f.accountId)
        .filter(
          (id: any) =>
            id !== null && id !== undefined && Number.isFinite(Number(id)),
        )
        .map((id: any) => Number(id)),
    ),
  );

  if (accountIds.length > 0) {
    const accounts = await prisma.fundAccount.findMany({
      where: {
        userId,
        id: { in: accountIds },
      },
      select: { id: true, name: true },
    });
    const accountMap = new Map(
      accounts.map((acc) => [Number(acc.id), acc]),
    ) as Map<number, { id: number; name: string }>;

    flows = flows.map((f: any) => {
      const accId =
        f.accountId != null && Number.isFinite(Number(f.accountId))
          ? Number(f.accountId)
          : null;
      return {
        ...f,
        account: accId != null ? accountMap.get(accId) ?? null : null,
      };
    });
  }

  return success(flows);
});
