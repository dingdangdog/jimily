import type { Prisma } from "~~/prisma/generated/client";
import prisma from "~~/server/lib/prisma";

/** 导入时由 Prisma 重新分配自增 id */
type Row = Record<string, any>;

export const DB_BACKUP_FORMAT = "jimily-db-backup" as const;
export const DB_BACKUP_VERSION = 1 as const;

export type JimilyDatabaseBackupV1 = {
  format: typeof DB_BACKUP_FORMAT;
  version: typeof DB_BACKUP_VERSION;
  exportedAt: string;
  appVersion?: string;
  users: Record<string, unknown>[];
  fundAccounts: Record<string, unknown>[];
  flows: Record<string, unknown>[];
  budgets: Record<string, unknown>[];
  liabilities: Record<string, unknown>[];
  liabilityRepayPlans: Record<string, unknown>[];
  liabilityRepayRecords: Record<string, unknown>[];
  receivables: Record<string, unknown>[];
  receivableCollectPlans: Record<string, unknown>[];
  receivableCollectRecords: Record<string, unknown>[];
  investmentProducts: Record<string, unknown>[];
  investmentDetails: Record<string, unknown>[];
  fixedFlows: Record<string, unknown>[];
  typeRelations: Record<string, unknown>[];
  systemAIProviders: Record<string, unknown>[];
  systemThemes: Record<string, unknown>[];
  userChatSessions: Record<string, unknown>[];
  userChatMessages: Record<string, unknown>[];
  systemConfig: Record<string, unknown> | null;
};

function stripId(row: Row): Row {
  const { id: _id, ...rest } = row;
  return rest;
}

async function wipeAllBusinessData(tx: Prisma.TransactionClient) {
  await tx.userChatMessage.deleteMany({});
  await tx.userChatSession.deleteMany({});
  await tx.investmentDetail.deleteMany({});
  await tx.liabilityRepayRecord.deleteMany({});
  await tx.liabilityRepayPlan.deleteMany({});
  await tx.liability.deleteMany({});
  await tx.receivableCollectRecord.deleteMany({});
  await tx.receivableCollectPlan.deleteMany({});
  await tx.receivable.deleteMany({});
  await tx.flow.deleteMany({});
  await tx.investmentProduct.deleteMany({});
  await tx.budget.deleteMany({});
  await tx.fixedFlow.deleteMany({});
  await tx.typeRelation.deleteMany({});
  await tx.fundAccount.deleteMany({});
  await tx.user.deleteMany({});
  await tx.systemAIProvider.deleteMany({});
  await tx.systemTheme.deleteMany({});
}

export async function buildDatabaseExportPayload(
  appVersion?: string
): Promise<JimilyDatabaseBackupV1> {
  const [
    users,
    fundAccounts,
    flows,
    budgets,
    liabilities,
    liabilityRepayPlans,
    liabilityRepayRecords,
    receivables,
    receivableCollectPlans,
    receivableCollectRecords,
    investmentProducts,
    investmentDetails,
    fixedFlows,
    typeRelations,
    systemAIProviders,
    systemThemes,
    userChatSessions,
    userChatMessages,
    systemConfig,
  ] = await Promise.all([
    prisma.user.findMany(),
    prisma.fundAccount.findMany(),
    prisma.flow.findMany(),
    prisma.budget.findMany(),
    prisma.liability.findMany(),
    prisma.liabilityRepayPlan.findMany(),
    prisma.liabilityRepayRecord.findMany(),
    prisma.receivable.findMany(),
    prisma.receivableCollectPlan.findMany(),
    prisma.receivableCollectRecord.findMany(),
    prisma.investmentProduct.findMany(),
    prisma.investmentDetail.findMany(),
    prisma.fixedFlow.findMany(),
    prisma.typeRelation.findMany(),
    prisma.systemAIProvider.findMany(),
    prisma.systemTheme.findMany(),
    prisma.userChatSession.findMany(),
    prisma.userChatMessage.findMany(),
    prisma.systemConfig.findUnique({ where: { id: 1 } }),
  ]);

  return {
    format: DB_BACKUP_FORMAT,
    version: DB_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion,
    users: users as unknown as Record<string, unknown>[],
    fundAccounts: fundAccounts as unknown as Record<string, unknown>[],
    flows: flows as unknown as Record<string, unknown>[],
    budgets: budgets as unknown as Record<string, unknown>[],
    liabilities: liabilities as unknown as Record<string, unknown>[],
    liabilityRepayPlans: liabilityRepayPlans as unknown as Record<string, unknown>[],
    liabilityRepayRecords: liabilityRepayRecords as unknown as Record<string, unknown>[],
    receivables: receivables as unknown as Record<string, unknown>[],
    receivableCollectPlans: receivableCollectPlans as unknown as Record<string, unknown>[],
    receivableCollectRecords: receivableCollectRecords as unknown as Record<string, unknown>[],
    investmentProducts: investmentProducts as unknown as Record<string, unknown>[],
    investmentDetails: investmentDetails as unknown as Record<string, unknown>[],
    fixedFlows: fixedFlows as unknown as Record<string, unknown>[],
    typeRelations: typeRelations as unknown as Record<string, unknown>[],
    systemAIProviders: systemAIProviders as unknown as Record<string, unknown>[],
    systemThemes: systemThemes as unknown as Record<string, unknown>[],
    userChatSessions: userChatSessions as unknown as Record<string, unknown>[],
    userChatMessages: userChatMessages as unknown as Record<string, unknown>[],
    systemConfig: systemConfig as unknown as Record<string, unknown> | null,
  };
}

function assertBackupPayload(raw: unknown): JimilyDatabaseBackupV1 {
  if (!raw || typeof raw !== "object") {
    throw new Error("备份内容不是有效的 JSON 对象");
  }
  const o = raw as Record<string, unknown>;
  if (o.format !== DB_BACKUP_FORMAT || o.version !== DB_BACKUP_VERSION) {
    throw new Error(
      `不支持的备份格式（需要 format=${DB_BACKUP_FORMAT}、version=${DB_BACKUP_VERSION}）`
    );
  }
  return raw as JimilyDatabaseBackupV1;
}

function num(
  v: unknown,
  map: Map<number, number>,
  optional = false
): number | null | undefined {
  if (v === null || v === undefined) {
    return optional ? (v as null | undefined) : undefined;
  }
  const old = Number(v);
  if (!Number.isFinite(old)) {
    return optional ? null : undefined;
  }
  const n = map.get(old);
  if (n === undefined) {
    return optional ? null : undefined;
  }
  return n;
}

export async function importDatabaseFromPayload(raw: unknown): Promise<void> {
  const payload = assertBackupPayload(raw);

  await prisma.$transaction(async (tx) => {
    await wipeAllBusinessData(tx);

    const userIdMap = new Map<number, number>();
    const accountIdMap = new Map<number, number>();
    const flowIdMap = new Map<number, number>();
    const liabilityIdMap = new Map<number, number>();
    const liabilityPlanIdMap = new Map<number, number>();
    const receivableIdMap = new Map<number, number>();
    const receivablePlanIdMap = new Map<number, number>();
    const productIdMap = new Map<number, number>();
    const sessionIdMap = new Map<number, number>();

    for (const row of payload.users ?? []) {
      const oldId = Number(row.id);
      const data = stripId(row as Row);
      const created = await tx.user.create({ data });
      if (Number.isFinite(oldId)) {
        userIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.fundAccounts ?? []) {
      const oldId = Number(row.id);
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      const created = await tx.fundAccount.create({
        data: { ...rest, userId },
      });
      if (Number.isFinite(oldId)) {
        accountIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.flows ?? []) {
      const oldId = Number(row.id);
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      const accountRaw = rest.accountId;
      let accountId: number | null = null;
      if (accountRaw !== null && accountRaw !== undefined) {
        const mapped = num(accountRaw, accountIdMap, true);
        accountId = mapped === undefined ? null : mapped;
      }
      const created = await tx.flow.create({
        data: {
          ...rest,
          userId,
          accountId,
        },
      });
      if (Number.isFinite(oldId)) {
        flowIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.budgets ?? []) {
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      await tx.budget.create({
        data: { ...rest, userId },
      });
    }

    for (const row of payload.liabilities ?? []) {
      const oldId = Number(row.id);
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      const occurFlowId = num(rest.occurFlowId, flowIdMap, true);
      const created = await tx.liability.create({
        data: {
          ...rest,
          userId,
          occurFlowId:
            occurFlowId === undefined ? null : occurFlowId,
        },
      });
      if (Number.isFinite(oldId)) {
        liabilityIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.liabilityRepayPlans ?? []) {
      const oldId = Number(row.id);
      const rest = stripId(row as Row);
      const liabilityId = num(rest.liabilityId, liabilityIdMap);
      if (liabilityId === undefined || liabilityId === null) continue;
      const created = await tx.liabilityRepayPlan.create({
        data: { ...rest, liabilityId },
      });
      if (Number.isFinite(oldId)) {
        liabilityPlanIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.liabilityRepayRecords ?? []) {
      const rest = stripId(row as Row);
      const liabilityId = num(rest.liabilityId, liabilityIdMap);
      if (liabilityId === undefined || liabilityId === null) continue;
      const planId = num(rest.planId, liabilityPlanIdMap, true);
      const flowId = num(rest.flowId, flowIdMap, true);
      await tx.liabilityRepayRecord.create({
        data: {
          ...rest,
          liabilityId,
          planId: planId === undefined ? null : planId,
          flowId: flowId === undefined ? null : flowId,
        },
      });
    }

    for (const row of payload.receivables ?? []) {
      const oldId = Number(row.id);
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      const occurFlowId = num(rest.occurFlowId, flowIdMap, true);
      const created = await tx.receivable.create({
        data: {
          ...rest,
          userId,
          occurFlowId:
            occurFlowId === undefined ? null : occurFlowId,
        },
      });
      if (Number.isFinite(oldId)) {
        receivableIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.receivableCollectPlans ?? []) {
      const oldId = Number(row.id);
      const rest = stripId(row as Row);
      const receivableId = num(rest.receivableId, receivableIdMap);
      if (receivableId === undefined || receivableId === null) continue;
      const created = await tx.receivableCollectPlan.create({
        data: {
          ...rest,
          receivableId,
        },
      });
      if (Number.isFinite(oldId)) {
        receivablePlanIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.receivableCollectRecords ?? []) {
      const rest = stripId(row as Row);
      const receivableId = num(rest.receivableId, receivableIdMap);
      if (receivableId === undefined || receivableId === null) continue;
      const planId = num(rest.planId, receivablePlanIdMap, true);
      const flowId = num(rest.flowId, flowIdMap, true);
      await tx.receivableCollectRecord.create({
        data: {
          ...rest,
          receivableId,
          planId: planId === undefined ? null : planId,
          flowId: flowId === undefined ? null : flowId,
        },
      });
    }

    for (const row of payload.investmentProducts ?? []) {
      const oldId = Number(row.id);
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      const created = await tx.investmentProduct.create({
        data: { ...rest, userId },
      });
      if (Number.isFinite(oldId)) {
        productIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.investmentDetails ?? []) {
      const rest = stripId(row as Row);
      const productId = num(rest.productId, productIdMap);
      const userId = num(rest.userId, userIdMap);
      if (
        productId === undefined ||
        productId === null ||
        userId === undefined ||
        userId === null
      ) {
        continue;
      }
      const flowId = num(rest.flowId, flowIdMap, true);
      await tx.investmentDetail.create({
        data: {
          ...rest,
          productId,
          userId,
          flowId: flowId === undefined ? null : flowId,
        },
      });
    }

    for (const row of payload.fixedFlows ?? []) {
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      await tx.fixedFlow.create({
        data: { ...rest, userId },
      });
    }

    for (const row of payload.typeRelations ?? []) {
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      await tx.typeRelation.create({
        data: { ...rest, userId },
      });
    }

    for (const row of payload.systemAIProviders ?? []) {
      const data = stripId(row as Row);
      await tx.systemAIProvider.create({ data });
    }

    for (const row of payload.systemThemes ?? []) {
      const data = stripId(row as Row);
      await tx.systemTheme.create({ data });
    }

    for (const row of payload.userChatSessions ?? []) {
      const oldId = Number(row.id);
      const rest = stripId(row as Row);
      const userId = num(rest.userId, userIdMap);
      if (userId === undefined || userId === null) continue;
      const created = await tx.userChatSession.create({
        data: { ...rest, userId },
      });
      if (Number.isFinite(oldId)) {
        sessionIdMap.set(oldId, created.id);
      }
    }

    for (const row of payload.userChatMessages ?? []) {
      const rest = stripId(row as Row);
      const sessionId = num(rest.sessionId, sessionIdMap);
      if (sessionId === undefined || sessionId === null) continue;
      await tx.userChatMessage.create({
        data: { ...rest, sessionId },
      });
    }

    if (payload.systemConfig && typeof payload.systemConfig === "object") {
      const sc = payload.systemConfig as Record<string, unknown>;
      const { id: _sid, createAt: _ca, updateAt: _ua, ...fields } = sc;
      await tx.systemConfig.upsert({
        where: { id: 1 },
        create: {
          id: 1,
          title: (fields.title as string | null | undefined) ?? null,
          description: (fields.description as string | null | undefined) ?? null,
          keywords: (fields.keywords as string | null | undefined) ?? null,
          version: (fields.version as string | null | undefined) ?? null,
          openRegister: Boolean(fields.openRegister ?? false),
        },
        update: {
          ...(fields.title !== undefined ? { title: fields.title as string | null } : {}),
          ...(fields.description !== undefined
            ? { description: fields.description as string | null }
            : {}),
          ...(fields.keywords !== undefined
            ? { keywords: fields.keywords as string | null }
            : {}),
          ...(fields.version !== undefined
            ? { version: fields.version as string | null }
            : {}),
          ...(fields.openRegister !== undefined
            ? { openRegister: Boolean(fields.openRegister) }
            : {}),
        },
      });
    }
  });
}
