import prisma from "~~/server/lib/prisma";

/**
 * @swagger
 * /api/entry/flow/all:
 *   get:
 *     summary: 获取账本所有流水记录
 *     tags: ["Flow"]
 *     security:
 *       - Authorization: []
 *     responses:
 *       200:
 *         description: 流水记录列表获取成功
 *         content:
 *           application/json:
 *             schema:
 *               Result: {
 *                 d: [] #[Flow流水记录数组]
 *               }
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  let flows: any[] = await prisma.flow.findMany({
    where: { userId },
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
