import prisma from "~~/server/lib/prisma";
import { recalcFundAccountFromFlows } from "~~/server/utils/db";

/**
 * @swagger
 * /api/entry/flow/del:
 *   post:
 *     summary: 删除流水记录
 *     tags: ["流水"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FlowIdBody'
 *     responses:
 *       200:
 *         description: 流水记录删除成功，d 为被删除的 Flow
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiEnvelope'
 *                 - type: object
 *                   properties:
 *                     d:
 *                       $ref: '#/components/schemas/Flow'
 *       400:
 *         description: 删除失败（缺少 id 或无权访问）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 */
export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  const body = await readBody(event);
  const id = body.id;

  if (!id) {
    return error("Not Find ID");
  }
  const row = await prisma.flow.findFirst({
    where: { id: Number(id), userId },
  });
  if (!row) {
    return error("Not Find ID");
  }
  const accountId = row.accountId ?? undefined;
  const deleted = await prisma.$transaction(async (tx) => {
    const result = await tx.flow.delete({
      where: { id: Number(id) },
    });
    await recalcFundAccountFromFlows(accountId, tx);
    return result;
  });
  return success(deleted);
});
