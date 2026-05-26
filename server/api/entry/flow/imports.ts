import crypto from "crypto";
import prisma from "~~/server/lib/prisma";
import {
  recalcFundAccountFromFlows,
  resolveImportFlowAccountId,
} from "~~/server/utils/db";

/** 根据时间+金额+账户+名称生成唯一流水编号（无第三方订单号时用于去重） */
function genFlowNoByContent(
  userId: number,
  flow: {
    day?: string | Date;
    money?: number;
    accountId?: number | null;
    name?: string;
  },
): string {
  const day =
    flow.day instanceof Date
      ? flow.day.toISOString().slice(0, 10)
      : flow.day
        ? new Date(flow.day).toISOString().slice(0, 10)
        : "";
  const money = Number(flow.money);
  const accountKey =
    flow.accountId != null && Number.isFinite(Number(flow.accountId))
      ? String(flow.accountId)
      : "";
  const name = String(flow.name ?? "").trim();
  const hash = crypto
    .createHash("sha256")
    .update(`${userId}|${day}|${money}|${accountKey}|${name}`)
    .digest("hex")
    .slice(0, 45);
  return `imp_${hash}`;
}

/**
 * @swagger
 * /api/entry/flow/imports:
 *   post:
 *     summary: 批量导入流水记录
 *     tags: ["流水"]
 *     security:
 *       - Authorization: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             mode: string 导入模式（add-追加，overwrite-覆盖）
 *             flows: [] #[Flow流水记录数组，可含 flowNo 用于去重；可选 channelHint 用于匹配资金账户]
 *     responses:
 *       200:
 *         description: 导入成功
 *         content:
 *           application/json:
 *             schema:
 *               Result:
 *                 d: object 含 count(number) 导入条数、skipped(number) 去重跳过条数
 *       400:
 *         description: 导入失败
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  const mode = String(body.mode ?? "add");
  const flows: any[] = Array.isArray(body.flows) ? body.flows : [];
  const userId = await getUserId(event);

  if (mode === "overwrite") {
    await prisma.flow.deleteMany({ where: { userId } });
  }

  if (flows.length === 0) {
    return success({ count: 0, skipped: 0 });
  }

  const accountCache = new Map<string, number>();
  const resolved: Array<{ flow: (typeof flows)[number]; accountId: number }> =
    [];
  for (const flow of flows) {
    const accountId = await resolveImportFlowAccountId(
      userId,
      flow as Record<string, unknown>,
      accountCache,
    );
    resolved.push({ flow, accountId });
  }

  const withFlowNo = resolved.map(({ flow, accountId }, index) => {
    const rawNo =
      flow.flowNo != null && String(flow.flowNo).trim() !== ""
        ? String(flow.flowNo).trim()
        : "";
    const flowNo =
      rawNo !== ""
        ? rawNo.slice(0, 50)
        : genFlowNoByContent(userId, {
            day: flow.day,
            money: flow.money,
            accountId,
            name: flow.name,
          });
    return { flow, flowNo, accountId, index };
  });

  const seen = new Set<string>();
  const deduped = withFlowNo.filter(({ flowNo }) => {
    if (seen.has(flowNo)) return false;
    seen.add(flowNo);
    return true;
  });

  const flowNos = deduped.map(({ flowNo }) => flowNo);

  let existingSet = new Set<string>();
  if (mode === "add" && flowNos.length > 0) {
    const existing = await prisma.flow.findMany({
      where: { userId, flowNo: { in: flowNos } },
      select: { flowNo: true },
    });
    existingSet = new Set(existing.map((r) => r.flowNo));
  }

  const toInsert = deduped.filter(({ flowNo }) => !existingSet.has(flowNo));
  const skipped = flows.length - toInsert.length;

  const datas = toInsert.map(({ flow, flowNo, accountId }) => ({
    userId,
    flowNo,
    name: flow.name != null ? String(flow.name) : "",
    day: new Date(flow.day),
    description: flow.description != null ? String(flow.description) : null,
    flowType: flow.flowType != null ? String(flow.flowType) : null,
    invoice: flow.invoice ? String(flow.invoice) : null,
    money: Number(flow.money),
    accountId,
    industryType:
      flow.type != null
        ? String(flow.type)
        : flow.industryType != null
          ? String(flow.industryType)
          : "",
    attribution: flow.attribution != null ? String(flow.attribution) : null,
    origin:
      flow.origin != null && String(flow.origin).trim() !== ""
        ? String(flow.origin).trim().slice(0, 200)
        : null,
  }));

  let created = { count: 0 };
  if (datas.length > 0) {
    created = await prisma.flow.createMany({ data: datas });

    const accountIds = Array.from(
      new Set(
        datas
          .map((d) => d.accountId)
          .filter(
            (id): id is number =>
              id !== null && id !== undefined && Number.isFinite(id),
          ),
      ),
    );
    for (const aid of accountIds) {
      await recalcFundAccountFromFlows(aid);
    }
  }

  return success({
    count: created.count,
    skipped,
  });
});
