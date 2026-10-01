import prisma from "~~/server/lib/prisma";
import type { Prisma } from "@prisma/client";

/**
 * @swagger
 * /api/entry/flow/condidate/patchcomfirm:
 *   post:
 *     summary: 批量确认候选平账记录
 *     tags: ["导入候选"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             items: array 批量平账项，元素字段 outId(number)、inIds(number 数组)
 *     responses:
 *       200:
 *         description: 批量平账确认成功
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: object 含 count(number) 成功处理条数（out+in 总数）
 *       400:
 *         description: 确认失败
 *         content:
 *           application/json:
 *             schema:
 *               message: string 错误信息，如 Invalid params
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  const body = await readBody(event);
  const items = body.items as Array<{ outId: number; inIds: number[] }> | undefined;

  if (!Array.isArray(items) || items.length === 0) {
    return error("Invalid params");
  }

  // 规范化与校验
  const normalized = items
    .map((it) => ({
      outId: Number(it.outId),
      inIds: Array.isArray(it.inIds)
        ? it.inIds.map((x) => Number(x)).filter((n) => Number.isFinite(n))
        : [],
    }))
    .filter((it) => Number.isFinite(it.outId) && it.inIds.length > 0);

  if (normalized.length === 0) {
    return error("Invalid params");
  }

  const txs: Prisma.PrismaPromise<any>[] = [];
  let affected = 0;

  for (const it of normalized) {
    // 更新支出记录（仅当前用户）
    txs.push(
      prisma.flow.updateMany({
        where: { id: it.outId, userId },
        data: {
          eliminate: 1,
          flowType: "不计收支",
        },
      })
    );
    affected += 1;
    // 更新对应收入记录（仅当前用户）
    txs.push(
      prisma.flow.updateMany({
        where: { id: { in: it.inIds }, userId },
        data: {
          eliminate: 1,
          flowType: "不计收支",
        },
      })
    );
    affected += it.inIds.length;
  }

  const results = await prisma.$transaction(txs);
  const count = results.reduce((sum: number, r: { count: number }) => sum + (r?.count ?? 0), 0);
  return success({ count });
});
