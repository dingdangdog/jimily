import prisma from "~~/server/lib/prisma";

/**
 * @swagger
 * /api/entry/flow/page:
 *   post:
 *     summary: 分页获取流水记录列表
 *     tags: ["Flow"]
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
 *             payType: string 支付方式（可选）
 *             startDay: string 开始日期（可选）
 *             endDay: string 结束日期（可选）
 *             name: string 流水名称（可选，支持模糊查询）
 *             attribution: string 归属（可选，支持模糊查询）
 *             description: string 描述（可选，支持模糊查询）
 *             pageNum: number 页码（默认为1）
 *             pageSize: number 每页大小（默认为15，-1表示查询全部）
 *             moneySort: string 金额排序（asc/desc）
 *             minMoney: number 最小金额（可选）
 *             maxMoney: number 最大金额（可选）
 *     responses:
 *       200:
 *         description: 分页数据获取成功
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: PagePack<Flow> 流水分页数据
 *       400:
 *         description: 获取失败
 *         content:
 *           application/json:
 *             schema:
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  const body = await readBody(event); // 获取查询参数

  const where: any = { userId }; // 条件查询（仅当前用户）

  // 普通查询条件
  if (body.id) {
    // equals 等于查询
    // contains 模糊查询（pgsql和mongo中，可以增加额外参数限制忽略大小写 mode: 'insensitive'）
    where.id = {
      equals: Number(body.id),
    };
  }
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
  if (body.payType) {
    where.payType = {
      equals: body.payType,
    };
  }
  if (body.accountId !== undefined && body.accountId !== null && body.accountId !== "") {
    where.accountId = {
      equals: Number(body.accountId),
    };
  }
  if (body.startDay && body.endDay) {
    where.day = {
      gte: new Date(body.startDay),
      lte: new Date(body.endDay),
    };
  } else if (body.startDay) {
    where.day = {
      gte: new Date(body.startDay),
    };
  } else if (body.endDay) {
    where.day = {
      lte: new Date(body.endDay),
    };
  }
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

  // 分页条件
  const pageNum = Number(body.pageNum ? body.pageNum : 1);
  const pageSize = Number(body.pageSize ? body.pageSize : 15);
  const skip = (pageNum - 1) * pageSize; // 计算跳过的条目数

  // 排序条件
  const orderBy: any = [
    {
      day: "desc",
    },
    {
      id: "desc", // 添加ID排序确保排序稳定性
    },
  ];
  if (body.moneySort) {
    // console.log(body.moneySort)
    // 将金额排序设置到第一个
    orderBy.unshift({ money: String(body.moneySort) });
  }
  let flows: any[] = [];
  if (pageSize == -1) {
    // 查询全部
    flows = await prisma.flow.findMany({
      where,
      orderBy,
    });
    // return success(books);
  } else {
    // 【条件、排序、分页】 组合查询
    flows = await prisma.flow.findMany({
      where,
      orderBy,
      skip,
      take: pageSize,
    });
  }

  // 由于 Prisma 模型不再显式定义外键关联，这里根据 accountId 约定式关联资金账户信息
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
      select: { id: true, name: true, accountType: true },
    });
    const accountMap = new Map(
      accounts.map((acc) => [Number(acc.id), acc]),
    ) as Map<number, { id: number; name: string; accountType: string }>;

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
  // 计算总页数
  const totalFlows = await prisma.flow.count({ where });
  const sumMoney = await prisma.flow.groupBy({
    by: ["flowType"],
    where,
    _sum: {
      money: true,
    },
  });
  const totalPages = Math.ceil(totalFlows / pageSize);
  // const sum = sumMoney[0];
  // console.log(sumMoney);
  let totalIn = 0;
  let totalOut = 0;
  let notInOut = 0;
  sumMoney.forEach((t: any) => {
    const raw = Number(t._sum.money);
    if (t.flowType == "收入") {
      totalIn = Math.abs(raw);
    } else if (t.flowType == "支出") {
      totalOut = Math.abs(raw);
    } else if (t.flowType == "不计收支") {
      notInOut = raw;
    }
  });

  return success({
    total: totalFlows,
    data: flows,
    pages: totalPages,
    totalIn,
    totalOut,
    notInOut,
  });
});
