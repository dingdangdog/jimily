import prisma from "~~/server/lib/prisma";
import { getFundAccountByName } from "~~/server/utils/db";

export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  const body = await readBody(event);

  const name = String(body.name || "").trim();
  if (!name) {
    return error("账户名称不能为空");
  }

  const existed = await getFundAccountByName(userId, name);
  if (existed && existed.status !== -1) {
    return success(existed);
  }

  const initialBalance = Number(body.initialBalance ?? 0);
  const currentBalance =
    body.currentBalance !== undefined && body.currentBalance !== null
      ? Number(body.currentBalance)
      : initialBalance;

  const created = await prisma.fundAccount.create({
    data: {
      userId,
      name,
      institution: body.institution ? String(body.institution) : null,
      accountNo: body.accountNo ? String(body.accountNo) : null,
      currency: body.currency ? String(body.currency) : "CNY",
      initialBalance,
      currentBalance,
      totalIncome: Number(body.totalIncome ?? 0),
      totalExpense: Number(body.totalExpense ?? 0),
      totalLiability: Number(body.totalLiability ?? 0),
      totalProfit: Number(body.totalProfit ?? 0),
      status:
        body.status !== undefined && body.status !== null
          ? Number(body.status)
          : 1,
      sortBy:
        body.sortBy !== undefined && body.sortBy !== null ? Number(body.sortBy) : 0,
      description: body.description ? String(body.description) : null,
    },
  });

  return success(created);
});
