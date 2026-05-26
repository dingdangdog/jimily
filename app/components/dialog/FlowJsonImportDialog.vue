<template>
  <div v-if="showFlowJsonImportDialog" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div
      class="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface text-foreground shadow-xl"
      @click.stop>
      <div class="flex items-center justify-between border-b border-border p-2 md:p-4">
        <h3 class="text-base font-semibold md:text-lg">JSON 流水导入</h3>
        <button class="text-foreground/40 transition-colors hover:text-foreground/70" @click="closeDialog">
          <XMarkIcon class="h-5 w-5" />
        </button>
      </div>

      <div class="space-y-4 p-4">
        <div>
          <label class="mb-2 block text-sm font-medium text-foreground/80">
            导入模式
          </label>
          <div class="space-y-2">
            <label class="flex items-center">
              <input v-model="importFlag" type="radio" value="add"
                class="h-4 w-4 border-border text-primary-600 focus:ring-primary-500" />
              <span class="ml-2 text-sm text-foreground/80">保留原有流水</span>
            </label>
            <label class="flex items-center">
              <input v-model="importFlag" type="radio" value="overwrite"
                class="h-4 w-4 border-border text-red-600 focus:ring-red-500" />
              <span class="ml-2 text-sm text-foreground/80">删除原有流水</span>
            </label>
          </div>
        </div>

        <div>
          <label class="mb-2 block text-sm font-medium text-foreground/80">
            选择 JSON 文件
          </label>
          <div class="relative">
            <input ref="fileInput" type="file" accept=".json" class="hidden" @change="onFileChange" />
            <button
              class="flex w-full items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-left text-foreground transition-colors hover:bg-surface"
              @click="() => fileInput?.click()">
              <DocumentArrowUpIcon class="h-5 w-5 text-foreground/40" />
              <span class="text-sm">
                {{ jsonFile ? jsonFile.name : "点击选择 JSON 文件" }}
              </span>
            </button>
            <div v-if="jsonFile" class="mt-1 text-xs text-foreground/60">
              文件大小: {{ formatFileSize(jsonFile.size) }}
            </div>
          </div>
        </div>

        <div class="text-center">
          <div v-if="jsonFlows.length > 0" class="rounded-md border border-primary-500/20 bg-primary-500/10 p-3">
            <div class="flex items-center justify-center gap-2">
              <CheckCircleIcon class="h-5 w-5 text-primary-600" />
              <span class="text-sm text-primary-700">
                共解析到 {{ jsonFlows.length }} 条流水
              </span>
            </div>
          </div>
          <div v-else class="rounded-md border border-border bg-surface-muted p-3">
            <div class="flex items-center justify-center gap-2">
              <ExclamationTriangleIcon class="h-5 w-5 text-foreground/60" />
              <span class="text-sm text-foreground/70">
                请选择要导入的 JSON 文件
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="flex flex-col gap-3 border-t border-border bg-surface-muted p-4 sm:flex-row">
        <button
          class="flex-1 rounded-md border border-border px-4 py-2 text-foreground/80 transition-colors hover:bg-surface"
          @click="closeDialog">
          取消
        </button>
        <button
          class="flex-1 rounded-md bg-primary-600 px-4 py-2 text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-secondary-400"
          :disabled="jsonFlows.length === 0 || importing" @click="submitImport">
          {{ importing ? "导入中..." : "确认导入" }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {
  CheckCircleIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/vue/24/outline";
import { onMounted, ref } from "vue";

import type { Flow } from "~/utils/table";
import { showFlowJsonImportDialog } from "~/utils/flag";

useEscapeKey(() => {
  if (showFlowJsonImportDialog.value) {
    showFlowJsonImportDialog.value = false;
  }
}, showFlowJsonImportDialog);

const { successCallback } = defineProps(["successCallback"]);

const importFlag = ref("add");
const jsonFile = ref<File | null>(null);
const jsonFlows = ref<Flow[]>([]);
const fileInput = ref<HTMLInputElement>();
const importing = ref(false);
const fundAccounts = ref<
  Array<{ id: number; name: string; institution?: string | null }>
>([]);

const isPlainObject = (value: unknown): value is Record<string, any> => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const pickArrayFromObject = (obj: Record<string, any>): any[] => {
  if (Array.isArray(obj.flows)) return obj.flows;
  if (Array.isArray(obj.data)) return obj.data;
  if (Array.isArray(obj.d)) return obj.d;
  const firstArrayKey = Object.keys(obj).find((key) =>
    Array.isArray(obj[key]),
  );
  return firstArrayKey ? (obj[firstArrayKey] as any[]) : [];
};

const extractAccountHintFromRaw = (raw: Record<string, any>): string => {
  const directKeys = [
    "channelHint",
    "payType",
    "accountName",
    "fundAccount",
    "资金账户",
  ] as const;
  for (const key of directKeys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  if (isPlainObject(raw.account)) {
    const name = raw.account.name;
    if (name != null && String(name).trim() !== "") {
      return String(name).trim();
    }
  } else if (typeof raw.account === "string" && raw.account.trim() !== "") {
    return raw.account.trim();
  }

  return "";
};

const mapJsonToFlow = (raw: Record<string, any>): Flow | null => {
  const flow: Flow = {};

  const daySource =
    raw.day ??
    raw.date ??
    raw.tradeDay ??
    raw.occurDay ??
    raw.occurDate ??
    null;
  if (daySource) {
    const d = new Date(daySource);
    if (!Number.isNaN(d.getTime())) {
      flow.day = d.toISOString().slice(0, 10);
    }
  }

  if (raw.flowType != null) {
    flow.flowType = String(raw.flowType).trim();
  }

  if (raw.industryType != null) {
    flow.industryType = String(raw.industryType).trim();
  } else if (raw.type != null) {
    flow.industryType = String(raw.type).trim();
  }

  if (raw.channelHint != null) {
    flow.channelHint = String(raw.channelHint).trim();
  } else if (raw.payType != null) {
    flow.channelHint = String(raw.payType).trim();
  } else {
    const accountHint = extractAccountHintFromRaw(raw);
    if (accountHint) {
      flow.channelHint = accountHint;
    }
  }

  const moneySource = raw.money ?? raw.amount;
  if (moneySource != null && moneySource !== "") {
    const n = Number(moneySource);
    if (Number.isFinite(n)) {
      flow.money = n;
    }
  }

  if (raw.name != null) {
    flow.name = String(raw.name).trim();
  }
  if (raw.description != null) {
    flow.description = String(raw.description).trim();
  }
  if (raw.origin != null) {
    flow.origin = String(raw.origin).trim();
  }
  if (raw.attribution != null) {
    flow.attribution = String(raw.attribution).trim();
  }
  if (raw.invoice != null) {
    flow.invoice = String(raw.invoice).trim();
  }

  const rawFlowNo = raw.flowNo ?? raw.orderNo ?? raw.tradeNo ?? raw.id;
  if (rawFlowNo != null && String(rawFlowNo).trim() !== "") {
    flow.flowNo = String(rawFlowNo).trim().slice(0, 50);
  }

  if (raw.accountId != null && raw.accountId !== "") {
    const id = Number(raw.accountId);
    if (Number.isFinite(id)) {
      flow.accountId = id;
    }
  } else if (isPlainObject(raw.account) && raw.account.id != null) {
    const id = Number(raw.account.id);
    if (Number.isFinite(id)) {
      flow.accountId = id;
    }
  }

  if (raw.eliminate != null && raw.eliminate !== "") {
    const e = Number(raw.eliminate);
    if (Number.isFinite(e)) {
      flow.eliminate = e;
    }
  }

  if (!flow.day && flow.money == null && !flow.name) {
    return null;
  }

  return flow;
};

const normalizeJsonFlows = (input: unknown): Flow[] => {
  let rows: any[] = [];
  if (Array.isArray(input)) {
    rows = input;
  } else if (isPlainObject(input)) {
    rows = pickArrayFromObject(input);
  }

  const result: Flow[] = [];
  for (const row of rows) {
    if (!isPlainObject(row)) continue;
    const flow = mapJsonToFlow(row);
    if (flow) result.push(flow);
  }
  return result;
};

const normalizeAccountText = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
};

const buildAccountSearchTerms = (value: unknown): string[] => {
  const base = Array.from(
    new Set(
      String(value ?? "")
        .split(/[\/、,，\s]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
  const extras: string[] = [];
  for (const item of base) {
    if (item.includes("微信")) extras.push("微信");
    if (item.includes("支付宝")) extras.push("支付宝");
    if (item.includes("京东")) extras.push("京东");
    if (item.includes("京东金融")) extras.push("京东金融");
    if (item.includes("现金")) extras.push("现金");
    if (item.includes("银行卡") || item.includes("储蓄卡")) extras.push("银行卡");
    if (item.includes("信用卡")) extras.push("信用卡");
  }
  return Array.from(new Set([...base, ...extras]));
};

const findMatchedFundAccount = (
  hint: string,
): { id: number; name: string; institution?: string | null } | null => {
  const normalizedHint = normalizeAccountText(hint);
  if (!normalizedHint) return null;

  const exact = fundAccounts.value.find((account) => {
    return (
      normalizeAccountText(account.name) === normalizedHint ||
      normalizeAccountText(account.institution) === normalizedHint
    );
  });
  if (exact) return exact;

  const terms = buildAccountSearchTerms(hint).map((item) =>
    normalizeAccountText(item),
  );
  if (!terms.length) return null;

  return (
    fundAccounts.value.find((account) => {
      const accountTexts = [
        normalizeAccountText(account.name),
        normalizeAccountText(account.institution),
      ].filter(Boolean);
      return terms.some((term) =>
        accountTexts.some(
          (text) => text.includes(term) || term.includes(text),
        ),
      );
    }) ?? null
  );
};

const loadFundAccounts = async () => {
  try {
    const res = await doApi.post<
      Array<{ id: number; name: string; institution?: string | null }>
    >("api/entry/account/all", { status: 1 });
    fundAccounts.value = Array.isArray(res) ? res : [];
  } catch {
    fundAccounts.value = [];
  }
};

const ensureFundAccountByHint = async (
  hint: string,
  cache: Map<string, number>,
): Promise<number | null> => {
  const normalizedHint = normalizeAccountText(hint);
  if (!normalizedHint) return null;

  const cached = cache.get(normalizedHint);
  if (cached != null) return cached;

  const existed = findMatchedFundAccount(hint);
  if (existed) {
    cache.set(normalizedHint, existed.id);
    return existed.id;
  }

  const created = await doApi.post<{
    id: number;
    name: string;
    institution?: string | null;
  }>("api/entry/account/add", {
    name: String(hint).trim().slice(0, 100),
    status: 1,
  });

  if (created?.id != null) {
    fundAccounts.value.unshift(created);
    cache.set(normalizedHint, created.id);
    return created.id;
  }

  return null;
};

const mergePayTypeToFundAccounts = async (flows: Flow[]): Promise<Flow[]> => {
  if (!flows.length) return [];
  if (!fundAccounts.value.length) {
    await loadFundAccounts();
  }

  const knownAccountIds = new Set(fundAccounts.value.map((account) => account.id));
  const cache = new Map<string, number>();
  const merged: Flow[] = [];
  for (const item of flows) {
    const flow = { ...item };
    if (flow.accountId != null && !knownAccountIds.has(flow.accountId)) {
      flow.accountId = undefined;
    }
    if (flow.accountId == null) {
      const hint = String(flow.channelHint ?? "").trim();
      if (hint) {
        const accountId = await ensureFundAccountByHint(hint, cache);
        if (accountId != null) {
          flow.accountId = accountId;
        }
      }
    }
    merged.push(flow);
  }
  return merged;
};

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const onFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    jsonFile.value = file;
    readJsonInfo();
  } else {
    jsonFile.value = null;
    jsonFlows.value = [];
  }
};

const readJsonInfo = () => {
  const file = jsonFile.value;
  if (!file) {
    jsonFlows.value = [];
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const text = String(event.target?.result || "");
      if (!text.trim()) {
        jsonFlows.value = [];
        Alert.warning("文件内容为空，请确认导出的 JSON 是否正确");
        return;
      }

      const parsed = JSON.parse(text);
      jsonFlows.value = normalizeJsonFlows(parsed);
      if (jsonFlows.value.length > 0) {
        Alert.success(
          `共解析到 ${jsonFlows.value.length} 条流水，可以点击确认导入`,
        );
      } else {
        Alert.warning("未发现有效流水数据，请检查文件内容");
      }
    } catch {
      Alert.error("文件内容格式不正确");
    }
  };

  reader.readAsText(file);
};

const submitImport = async () => {
  if (jsonFlows.value.length === 0 || importing.value) return;

  importing.value = true;
  try {
    const flows = await mergePayTypeToFundAccounts(jsonFlows.value);
    const res = await doApi.post<{ count: number; skipped?: number }>(
      "api/entry/flow/imports",
      {
        mode: importFlag.value,
        flows,
      },
    );

    if (res && typeof res.count === "number") {
      const msg =
        (res.skipped ?? 0) > 0
          ? `导入成功，共导入 ${res.count} 条流水，已跳过 ${res.skipped} 条重复`
          : `导入成功，共导入 ${res.count} 条流水`;
      Alert.success(msg);
      successCallback();
      showFlowJsonImportDialog.value = false;
    } else if (res && res.count === 0 && (res.skipped ?? 0) > 0) {
      Alert.warning(`未新增流水，共跳过 ${res.skipped} 条重复`);
      successCallback();
      showFlowJsonImportDialog.value = false;
    } else {
      Alert.error("导入失败，请检查数据");
    }
  } catch {
    Alert.error("导入失败，服务出错");
  } finally {
    importing.value = false;
  }
};

const closeDialog = () => {
  showFlowJsonImportDialog.value = false;
};

onMounted(() => {
  loadFundAccounts();
});
</script>

<style scoped></style>
