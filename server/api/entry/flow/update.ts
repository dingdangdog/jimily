import prisma from "~~/server/lib/prisma";
import {
  recalcFundAccountFromFlows,
  resolveFlowAccountDelta,
  normalizeFlowTypeLabel,
} from "~~/server/utils/db";

/**
 * @swagger
 * /api/entry/flow/update:
 *   post:
 *     summary: 更新流水记录
 *     tags: ["流水"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateFlowDto'
 *     responses:
 *       200:
 *         description: 流水记录更新成功，d 为更新后的 Flow
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
 *         description: 更新失败（如缺少 id 或记录不存在）
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiEnvelope'
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);
  if (!body.id) {
    return error("Not Find ID");
  }
  const flow = {
    ...(body.day != null && body.day !== "" && { day: new Date(body.day) }),
    flowType: String(body.flowType || ""), // 流水类型：收入、支出
    industryType: String(body.industryType || ""), // 行业分类 原 type（收入类型、支出类型）
    money: Number(body.money || ""),
    name: String(body.name || ""),
    description: String(body.description || ""),
    attribution: String(body.attribution || ""),
    accountId:
      body.accountId !== undefined
        ? body.accountId
          ? Number(body.accountId)
          : null
        : undefined,
    accountDelta:
      body.accountDelta !== undefined && body.accountDelta !== null
        ? Number(body.accountDelta)
        : undefined,
  };
  const userId = await getUserId(event);
  const row = await prisma.$transaction(async (tx) => {
    const oldRow = await tx.flow.findFirst({
      where: { id: Number(body.id), userId },
    });
    if (!oldRow) {
      return null;
    }

    const oldAccountId = oldRow.accountId ?? undefined;
    const nextAccountId =
      flow.accountId !== undefined ? flow.accountId : oldRow.accountId;
    const nextFlowType = flow.flowType ?? oldRow.flowType ?? "";
    const normalizedType = normalizeFlowTypeLabel(nextFlowType);
    const rawNextMoney =
      flow.money !== undefined && flow.money !== null
        ? flow.money
        : oldRow.money;
    const nextMoney =
      normalizedType === "收入" || normalizedType === "支出"
        ? Math.abs(Number(rawNextMoney || 0))
        : rawNextMoney;
    const nextDay = flow.day ?? oldRow.day;
    const nextDelta = resolveFlowAccountDelta({
      flowType: nextFlowType,
      money: Number(nextMoney || 0),
      accountDelta: flow.accountDelta,
    });

    const updated = await tx.flow.update({
      where: { id: Number(body.id) },
      data: {
        ...flow,
        accountId: nextAccountId,
        accountDelta: nextAccountId != null ? nextDelta : null,
        accountBal: null,
      },
    });

    await recalcFundAccountFromFlows(oldAccountId, tx);
    const newAccountId = updated.accountId ?? undefined;
    if (newAccountId !== oldAccountId) {
      await recalcFundAccountFromFlows(newAccountId, tx);
    }
    return updated;
  });
  if (!row) {
    return error("Not Find ID");
  }
  return success(row);
});
