import prisma from "~~/server/lib/prisma";
import { recalcFundAccountFromFlows } from "~~/server/utils/db";

/**
 * @swagger
 * /api/entry/flow/dels:
 *   post:
 *     summary: 批量删除流水记录
 *     tags: ["流水"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FlowIdsBody'
 *     responses:
 *       200:
 *         description: 批量删除成功，d 为 deleteMany 结果 { count }
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     d:
 *                       $ref: '#/components/schemas/FlowBatchDeletePayload'
 *       400:
 *         description: 删除失败（如缺少 ids）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  const body = await readBody(event);
  const ids = body.ids;

  if (!ids) {
    return error("Not Find ID");
  }
  const deleted = await prisma.$transaction(async (tx) => {
    const rows = await tx.flow.findMany({
      where: {
        id: { in: ids },
        userId,
      },
    });
    const accountIds = new Set<number>();
    for (const row of rows) {
      if (row.accountId) accountIds.add(row.accountId);
    }
    const result = await tx.flow.deleteMany({
      where: {
        id: { in: ids },
        userId,
      },
    });
    for (const accountId of accountIds) {
      await recalcFundAccountFromFlows(accountId, tx);
    }
    return result;
  });
  return success(deleted);
});
