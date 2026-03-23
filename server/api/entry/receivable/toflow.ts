import type { Prisma } from "~~/prisma/generated/client";
import prisma from "~~/server/lib/prisma";
import { recalcFundAccountFromFlows } from "~~/server/utils/db";

/**
 * @swagger
 * /api/entry/receivable/toflow:
 *   post:
 *     summary: 将待收款转换为收入流水
 *     tags: ["Receivable"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             id: number 待收款ID
 *             actualDay: string 实际收款日期
 *             accountId: number 资金账户ID（可选，默认现金账户）
 *             industryType: string 收入类型（可选）
 *             attribution: string 流水归属（可选）
 *     responses:
 *       200:
 *         description: 转换成功
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: {
 *                   receivable: Receivable 更新后的待收款,
 *                   flow: Flow 创建的流水记录
 *                 }
 *       400:
 *         description: 转换失败
 *         content:
 *           application/json:
 *             schema:
 *               Error: {
 *                 message: 错误信息
 *               }
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  const { id, actualDay, accountId: bodyAccountId, industryType, attribution } =
    body;

  if (!id) {
    return error("待收款ID不能为空");
  }

  if (!actualDay) {
    return error("实际收款日期不能为空");
  }

  const userId = await getUserId(event);

  const receivable = await prisma.receivable.findFirst({
    where: {
      id: Number(id),
      status: 0,
    },
  });

  if (!receivable) {
    return error("待收款记录不存在或已收款");
  }

  let accountId: number | null =
    bodyAccountId !== undefined && bodyAccountId !== null
      ? Number(bodyAccountId)
      : null;
  if (accountId != null && !Number.isFinite(accountId)) {
    accountId = null;
  }
  if (accountId == null) {
    const cash = await prisma.fundAccount.findFirst({
      where: {
        userId,
        status: { not: -1 },
        name: { equals: "现金", mode: "insensitive" },
      },
    });
    if (!cash) {
      const created = await prisma.fundAccount.create({
        data: {
          userId,
          name: "现金",
          currency: "CNY",
          initialBalance: 0,
          currentBalance: 0,
          totalIncome: 0,
          totalExpense: 0,
          totalLiability: 0,
          totalProfit: 0,
          status: 1,
          sortBy: 0,
        },
      });
      accountId = created.id;
    } else {
      accountId = cash.id;
    }
  } else {
    const acc = await prisma.fundAccount.findFirst({
      where: { id: accountId, userId, status: { not: -1 } },
    });
    if (!acc) {
      return error("资金账户不存在或不可用");
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const actualDate = new Date(actualDay);
    const flow = await tx.flow.create({
      data: {
        userId,
        flowNo: `F${Date.now()}_${Math.random().toString(36).slice(2, 11)}`,
        day: actualDate,
        flowType: "收入",
        name: receivable.name || "待收款收入",
        description: receivable.description || `来自待收款: ${receivable.name}`,
        money: receivable.money || 0,
        industryType: industryType || "其他收入",
        attribution: attribution || "",
        origin: "待收款转入",
        accountId,
      },
    });

    const updatedReceivable = await tx.receivable.update({
      where: { id: Number(id) },
      data: {
        status: 1,
      },
    });

    await recalcFundAccountFromFlows(
      accountId ?? undefined,
      tx as Prisma.TransactionClient,
    );

    return {
      receivable: updatedReceivable,
      flow,
    };
  });

  return success(result);
});
