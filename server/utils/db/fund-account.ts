import prisma from "~~/server/lib/prisma";
import type { Prisma } from "~~/prisma/generated/client";
import {
  type AIToolContext,
  type PaginationParams,
  type PaginationResult,
  buildPagination,
  calcTotalPages,
} from "./types";

type FundAccount = Prisma.FundAccountGetPayload<Record<string, never>>;

/** FundAccount 查询条件 */
export interface FundAccountQueryWhere {
  id?: number;
  userId?: number;
  status?: number;
  name?: string;
  keyword?: string;
}

function buildFundAccountWhere(
  input: FundAccountQueryWhere = {},
): Prisma.FundAccountWhereInput {
  const where: Prisma.FundAccountWhereInput = {};
  if (input.id != null) where.id = input.id;
  if (input.userId != null) where.userId = input.userId;
  if (input.status != null) where.status = input.status;
  if (input.name) where.name = input.name;
  if (input.keyword) {
    where.OR = [
      { name: { contains: input.keyword, mode: "insensitive" } },
      { institution: { contains: input.keyword, mode: "insensitive" } },
      { accountNo: { contains: input.keyword, mode: "insensitive" } },
      { description: { contains: input.keyword, mode: "insensitive" } },
    ];
  }
  return where;
}

/** 根据 ID 查询单条 */
export async function getFundAccountById(
  id: number,
): Promise<FundAccount | null> {
  return prisma.fundAccount.findUnique({ where: { id } });
}

/** 根据用户+名称查询单条 */
export async function getFundAccountByName(
  userId: number,
  name: string,
): Promise<FundAccount | null> {
  return prisma.fundAccount.findFirst({
    where: {
      userId,
      name: { equals: name, mode: "insensitive" },
    },
  });
}

function splitAccountKeywords(input: string): string[] {
  return Array.from(
    new Set(
      String(input || "")
        .split(/[\/、,，\s]+/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  );
}

/**
 * 从渠道/摘要等文本拆出关键词，并补充常见渠道简称，便于按账户名称/机构匹配。
 */
function expandChannelSearchTerms(input: string): string[] {
  const base = splitAccountKeywords(input);
  const extra: string[] = [];
  for (const x of base) {
    if (/微信/.test(x)) extra.push("微信");
    if (/支付宝/.test(x)) extra.push("支付宝");
    if (/信用卡/.test(x)) extra.push("信用卡");
    if (/银行卡|借记卡|储蓄卡/.test(x)) extra.push("银行卡");
    if (/现金/.test(x)) extra.push("现金");
    if (/投资|基金|股票|理财|券商|金融/.test(x)) extra.push("投资账户");
  }
  return Array.from(new Set([...base, ...extra].filter(Boolean)));
}

/**
 * 按渠道文本（如微信、支付宝、某银行卡名）智能匹配资金账户（名称精确优先，其次名称/机构模糊）
 */
export async function resolveFundAccountByChannelText(
  userId: number,
  channelText?: string | null,
): Promise<FundAccount | null> {
  const text = String(channelText || "").trim();
  if (!text) return null;

  const terms = expandChannelSearchTerms(text);
  if (terms.length === 0) return null;

  const exactByName = await prisma.fundAccount.findFirst({
    where: {
      userId,
      status: { not: -1 },
      OR: terms.map((name) => ({
        name: { equals: name, mode: "insensitive" as const },
      })),
    },
    orderBy: [{ sortBy: "asc" }, { id: "desc" }],
  });
  if (exactByName) return exactByName;

  const fuzzy = await prisma.fundAccount.findFirst({
    where: {
      userId,
      status: { not: -1 },
      OR: terms.flatMap((keyword) => [
        { name: { contains: keyword, mode: "insensitive" as const } },
        { institution: { contains: keyword, mode: "insensitive" as const } },
      ]),
    },
    orderBy: [{ sortBy: "asc" }, { id: "desc" }],
  });
  return fuzzy;
}

/** 从导入流水对象中提取资金账户名称/渠道提示（兼容多种 JSON 字段） */
export function extractImportAccountHint(flow: Record<string, unknown>): string {
  const directKeys = [
    "channelHint",
    "payType",
    "accountName",
    "fundAccount",
    "资金账户",
  ] as const;
  for (const key of directKeys) {
    const value = flow[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  const account = flow.account;
  if (account != null && typeof account === "object" && !Array.isArray(account)) {
    const name = (account as Record<string, unknown>).name;
    if (name != null && String(name).trim() !== "") {
      return String(name).trim();
    }
  }
  if (typeof account === "string" && account.trim() !== "") {
    return account.trim();
  }

  return "";
}

function normalizeImportAccountHint(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

/**
 * 按名称获取或创建资金账户（同名只保留一个，忽略大小写）。
 */
export async function getOrCreateFundAccountByName(
  userId: number,
  name: string,
): Promise<FundAccount> {
  const trimmed = String(name || "").trim().slice(0, 100);
  if (!trimmed) {
    return getOrCreateCashFundAccount(userId);
  }

  const existed = await getFundAccountByName(userId, trimmed);
  if (existed && existed.status !== -1) {
    return existed;
  }

  return prisma.fundAccount.create({
    data: {
      userId,
      name: trimmed,
      currency: "CNY",
      initialBalance: 0,
      currentBalance: 0,
      totalIncome: 0,
      totalExpense: 0,
      totalLiability: 0,
      totalProfit: 0,
      status: 1,
    },
  });
}

/**
 * 获取用户默认现金账户；若不存在则自动创建。
 * 用于无法从渠道文本/账户信息中解析目标账户时的兜底。
 */
export async function getOrCreateCashFundAccount(
  userId: number,
): Promise<FundAccount> {
  const existed = await getFundAccountByName(userId, "现金");
  if (existed && existed.status !== -1) {
    return existed;
  }

  return prisma.fundAccount.create({
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
      description: "系统默认现金账户",
    },
  });
}

/**
 * 批量导入时解析流水归属的资金账户 ID（带缓存，避免并发重复建户）。
 */
export async function resolveImportFlowAccountId(
  userId: number,
  flow: Record<string, unknown>,
  cache: Map<string, number>,
): Promise<number> {
  if (flow.accountId !== undefined && flow.accountId !== null && flow.accountId !== "") {
    const id = Number(flow.accountId);
    if (Number.isFinite(id)) {
      const valid = await prisma.fundAccount.findFirst({
        where: { id, userId, status: { not: -1 } },
        select: { id: true },
      });
      if (valid) return valid.id;
    }
  }

  const hint = extractImportAccountHint(flow);
  if (hint) {
    const cacheKey = `hint:${normalizeImportAccountHint(hint)}`;
    const cached = cache.get(cacheKey);
    if (cached != null) return cached;

    const matched = await resolveFundAccountByChannelText(userId, hint);
    const account =
      matched ?? (await getOrCreateFundAccountByName(userId, hint));
    cache.set(cacheKey, account.id);
    return account.id;
  }

  const cashKey = "cash";
  const cashCached = cache.get(cashKey);
  if (cashCached != null) return cashCached;

  const cash = await getOrCreateCashFundAccount(userId);
  cache.set(cashKey, cash.id);
  return cash.id;
}

/** 分页查询 */
export async function getFundAccountsPage(
  whereInput: FundAccountQueryWhere = {},
  pagination: PaginationParams = {},
  orderBy: Prisma.FundAccountOrderByWithRelationInput[] = [
    { sortBy: "asc" },
    { id: "desc" },
  ],
): Promise<PaginationResult<FundAccount>> {
  const where = buildFundAccountWhere(whereInput);
  const { skip, take, pageNum, pageSize } = buildPagination(pagination);

  const [data, total] = await Promise.all([
    prisma.fundAccount.findMany({ where, orderBy, skip, take }),
    prisma.fundAccount.count({ where }),
  ]);

  return {
    total,
    data,
    pages: calcTotalPages(total, pageSize),
    pageNum,
    pageSize,
  };
}

/** 查询全部 */
export async function getFundAccountsAll(
  whereInput: FundAccountQueryWhere = {},
): Promise<FundAccount[]> {
  const where = buildFundAccountWhere(whereInput);
  return prisma.fundAccount.findMany({
    where,
    orderBy: [{ sortBy: "asc" }, { id: "desc" }],
  });
}

/** 创建 */
export async function createFundAccount(
  data: Prisma.FundAccountCreateInput,
): Promise<FundAccount> {
  return prisma.fundAccount.create({ data });
}

/** 批量创建（按名称跳过已存在账户） */
export async function createFundAccountsBatch(input: {
  userId: number;
  names: string[];
  defaultCurrency?: string;
}): Promise<{ created: FundAccount[]; skipped: string[] }> {
  const userId = input.userId;
  const currency = input.defaultCurrency || "CNY";
  const normalizedNames = Array.from(
    new Set(input.names.map((v) => String(v || "").trim()).filter(Boolean)),
  );
  if (normalizedNames.length === 0) {
    return { created: [], skipped: [] };
  }

  const existing = await prisma.fundAccount.findMany({
    where: {
      userId,
      OR: normalizedNames.map((name) => ({
        name: { equals: name, mode: "insensitive" as const },
      })),
    },
    select: { name: true },
  });
  const existingSet = new Set(existing.map((x) => x.name.toLowerCase()));

  const toCreate = normalizedNames.filter(
    (name) => !existingSet.has(name.toLowerCase()),
  );
  const skipped = normalizedNames.filter((name) =>
    existingSet.has(name.toLowerCase()),
  );

  const created: FundAccount[] = [];
  for (const name of toCreate) {
    const row = await prisma.fundAccount.create({
      data: {
        userId,
        name,
        currency,
        initialBalance: 0,
        currentBalance: 0,
        totalIncome: 0,
        totalExpense: 0,
        totalLiability: 0,
        totalProfit: 0,
        status: 1,
      },
    });
    created.push(row);
  }

  return { created, skipped };
}

export async function addFundAccountByAI(
  args: Record<string, unknown>,
  ctx: AIToolContext,
): Promise<{
  success: boolean;
  message: string;
  account?: FundAccount;
  skipped?: boolean;
}> {
  const name = String(args.name || "").trim();
  if (!name) {
    return { success: false, message: "账户名称不能为空" };
  }

  const existed = await getFundAccountByName(ctx.userId, name);
  if (existed) {
    return {
      success: true,
      message: "账户已存在，已跳过创建",
      account: existed,
      skipped: true,
    };
  }

  const initialBalance = Number(args.initialBalance ?? 0);
  const currentBalance =
    args.currentBalance != null ? Number(args.currentBalance) : initialBalance;
  const status = args.status != null ? Number(args.status) : 1;

  const created = await createFundAccount({
    userId: ctx.userId,
    name,
    institution: args.institution ? String(args.institution) : null,
    accountNo: args.accountNo ? String(args.accountNo) : null,
    currency: "CNY",
    initialBalance,
    currentBalance,
    totalIncome: 0,
    totalExpense: 0,
    totalLiability: 0,
    totalProfit: 0,
    status,
    description: args.description ? String(args.description) : null,
  });

  return {
    success: true,
    message: "账户创建成功",
    account: created,
  };
}

export async function updateFundAccountBalanceByAI(
  args: Record<string, unknown>,
  ctx: AIToolContext,
): Promise<{
  success: boolean;
  message: string;
  account?: FundAccount;
}> {
  const currentBalance = Number(args.currentBalance);
  if (!Number.isFinite(currentBalance)) {
    return { success: false, message: "currentBalance 必须为数字" };
  }

  let account: FundAccount | null = null;
  if (args.id != null) {
    const id = Number(args.id);
    if (Number.isFinite(id)) {
      const found = await getFundAccountById(id);
      if (found && found.userId === ctx.userId) {
        account = found;
      }
    }
  }
  if (!account && args.name) {
    account = await getFundAccountByName(ctx.userId, String(args.name));
  }
  if (!account) {
    return { success: false, message: "未找到对应资金账户" };
  }

  const updated = await updateFundAccount(account.id, {
    currentBalance,
    ...(args.totalLiability !== undefined &&
      args.totalLiability !== null && {
        totalLiability: Number(args.totalLiability),
      }),
    ...(args.totalProfit !== undefined &&
      args.totalProfit != null && { totalProfit: Number(args.totalProfit) }),
    ...(args.description !== undefined && {
      description: String(args.description || ""),
    }),
  });

  return {
    success: true,
    message: "账户余额更新成功",
    account: updated,
  };
}

export async function batchAddFundAccountsByAI(
  args: Record<string, unknown>,
  ctx: AIToolContext,
): Promise<Record<string, unknown>> {
  const list = Array.isArray(args.accountNames) ? args.accountNames : [];
  const names = list.map((x) => String(x || "").trim()).filter(Boolean);
  if (names.length === 0) {
    return { success: false, message: "accountNames 不能为空" };
  }

  const result = await createFundAccountsBatch({
    userId: ctx.userId,
    names,
    defaultCurrency: args.defaultCurrency
      ? String(args.defaultCurrency)
      : "CNY",
  });

  return {
    success: true,
    message: `批量创建完成，成功 ${result.created.length} 个，跳过 ${result.skipped.length} 个`,
    created: result.created.map((x) => ({
      id: x.id,
      name: x.name,
      currentBalance: x.currentBalance,
    })),
    skipped: result.skipped,
  };
}

export async function queryFundAccountsByAI(
  args: Record<string, unknown>,
  ctx: AIToolContext,
): Promise<Record<string, unknown>> {
  const pageNum = Math.max(1, Number(args.pageNum) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(args.pageSize) || 20));

  const result = await getFundAccountsPage(
    {
      userId: ctx.userId,
      keyword: args.keyword ? String(args.keyword) : undefined,
      status:
        args.status !== undefined && args.status !== null
          ? Number(args.status)
          : undefined,
    },
    { pageNum, pageSize },
  );

  return {
    total: result.total,
    pageNum: result.pageNum,
    pageSize: result.pageSize,
    data: result.data.map((x) => ({
      id: x.id,
      name: x.name,
      currentBalance: x.currentBalance,
      totalIncome: x.totalIncome,
      totalExpense: x.totalExpense,
      totalLiability: x.totalLiability,
      status: x.status,
    })),
  };
}

/** 更新 */
export async function updateFundAccount(
  id: number,
  data: Prisma.FundAccountUpdateInput,
): Promise<FundAccount> {
  return prisma.fundAccount.update({ where: { id }, data });
}

/** 删除 */
export async function deleteFundAccount(id: number): Promise<FundAccount> {
  return prisma.fundAccount.delete({ where: { id } });
}
