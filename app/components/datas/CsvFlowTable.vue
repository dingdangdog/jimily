<template>
  <div
    class="relative bg-surface text-foreground rounded-lg shadow-sm border border-border overflow-hidden"
  >
    <div
      v-if="renderingTable"
      class="absolute inset-0 z-20 flex items-center justify-center bg-surface/88 backdrop-blur-sm"
    >
      <div
        class="w-full max-w-sm rounded-2xl border border-border bg-background/95 px-6 py-5 shadow-xl"
      >
        <div class="flex items-center gap-4">
          <div
            class="h-10 w-10 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600"
          ></div>
          <div class="min-w-0 flex-1">
            <div class="text-sm font-semibold text-foreground">
              预览渲染中
            </div>
            <div class="mt-1 text-xs text-foreground/60">
              正在分批构建表格，数据量越大耗时越久。
            </div>
          </div>
          <div class="text-lg font-semibold text-primary-600">
            {{ renderProgress }}%
          </div>
        </div>
        <div class="mt-4 h-2 overflow-hidden rounded-full bg-surface-muted">
          <div
            class="h-full rounded-full bg-gradient-to-r from-primary-500 via-primary-400 to-emerald-400 transition-[width] duration-200 ease-out"
            :style="{ width: `${renderProgress}%` }"
          ></div>
        </div>
      </div>
    </div>

    <div class="max-h-[60vh] overflow-auto">
      <table ref="excelTable" class="w-full border-collapse">
        <thead
          ref="excelTableHead"
          class="bg-surface-muted sticky top-0 z-10"
        ></thead>
        <tbody ref="excelTableBody" class="divide-y divide-border"></tbody>
      </table>
    </div>

    <div class="border-t border-border"></div>

    <div class="px-4 py-3 bg-surface-muted">
      <div
        class="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between"
      >
        <div class="flex items-center gap-4">
          <span class="text-sm text-foreground/70">
            解析到的流水数量:
            <span class="font-semibold text-primary-600">{{
              flows.length
            }}</span>
          </span>
        </div>

        <div class="flex flex-wrap gap-3 items-center">
          <div v-if="isThirdPartyImport" class="flex items-center gap-2">
            <label
              class="text-sm font-medium text-foreground/80 whitespace-nowrap"
            >
              资金账户:
            </label>
            <select
              v-model="selectedAccountId"
              class="min-w-[120px] px-2 py-1 text-sm border border-border rounded bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">不指定</option>
              <option v-for="a in fundAccounts" :key="a.id" :value="a.id">
                {{ a.name }}
              </option>
            </select>
          </div>

          <div class="flex items-center gap-2">
            <label
              class="text-sm font-medium text-foreground/80 whitespace-nowrap"
            >
              流水归属:
            </label>
            <input
              v-model="attribution"
              type="text"
              placeholder="可选"
              class="w-32 px-2 py-1 text-sm border border-border rounded bg-background text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>

          <button
            @click="submitUpload"
            :disabled="uploading || renderingTable"
            class="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-secondary-400 disabled:cursor-not-allowed text-white rounded-lg transition-colors duration-200 flex items-center gap-2 text-sm font-medium"
          >
            <div
              v-if="uploading"
              class="animate-spin rounded-full h-4 w-4 border-b-2 border-white"
            ></div>
            <CloudArrowUpIcon v-else class="h-4 w-4" />
            {{ uploading ? "导入中..." : "确认导入" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { CloudArrowUpIcon } from "@heroicons/vue/24/outline";
import { computed, nextTick, onMounted, ref, watch } from "vue";

import { doApi } from "~/utils/api";
import { Alert } from "~/utils/alert";
import { showFlowExcelImportDialog } from "~/utils/flag";
import type { Flow } from "~/utils/table";

const props = defineProps<{
  items: Flow[];
  tableHead: Record<string, number>;
  tableBody: any[][];
  successCallback: () => void;
  importSource?: string;
}>();

const uploading = ref(false);
const renderingTable = ref(false);
const renderProgress = ref(0);
const flows = ref<Flow[]>([]);
const attribution = ref("");
const fundAccounts = ref<{ id: number; name: string }[]>([]);
const selectedAccountId = ref<number | "">("");
const excelTable = ref<HTMLTableElement | null>(null);
const excelTableHead = ref<HTMLTableSectionElement | null>(null);
const excelTableBody = ref<HTMLTableSectionElement | null>(null);

let renderTaskId = 0;

const isThirdPartyImport = computed(
  () =>
    props.importSource &&
    ["alipay", "wxpay", "jdFinance"].includes(String(props.importSource)),
);

const originLabel = computed(() => {
  const map: Record<string, string> = {
    alipay: "支付宝导入",
    wxpay: "微信导入",
    jdFinance: "京东金融导入",
  };
  return props.importSource ? (map[String(props.importSource)] ?? "") : "";
});

function matchAccountId(
  accounts: { id: number; name: string }[],
  source: string,
): number | null {
  const keyword =
    { alipay: "支付宝", wxpay: "微信", jdFinance: "京东" }[
      String(source)
    ] ?? "";
  if (!keyword || !accounts.length) return null;

  const fuzzy = accounts.find((a) => a.name && a.name.includes(keyword));
  if (fuzzy) return fuzzy.id;

  const cash = accounts.find((a) => a.name === "现金");
  return cash ? cash.id : null;
}

async function loadAccounts() {
  try {
    const res = await doApi.post<{ id: number; name: string }[]>(
      "api/entry/account/all",
      { status: 1 },
    );
    fundAccounts.value = Array.isArray(res) ? res : [];
  } catch {
    fundAccounts.value = [];
  }
}

function buildHeader(heads: string[]) {
  if (!excelTableHead.value) return;

  excelTableHead.value.innerHTML = "";
  const head = document.createElement("tr");
  head.className = "border-b border-border";

  for (const text of heads) {
    const th = document.createElement("th");
    th.innerText = text;
    th.className =
      "px-3 py-2 text-left text-xs font-medium text-foreground/60 uppercase tracking-wider bg-surface-muted";
    th.style.textAlign = "left";
    head.appendChild(th);
  }

  excelTableHead.value.appendChild(head);
}

async function renderTable() {
  flows.value = Array.isArray(props.items) ? [...props.items] : [];
  await nextTick();

  if (!excelTableHead.value || !excelTableBody.value) {
    return;
  }

  const currentTaskId = ++renderTaskId;
  const heads = Object.keys(props.tableHead ?? {});
  const rows = Array.isArray(props.tableBody) ? props.tableBody : [];

  renderingTable.value = true;
  renderProgress.value = 0;
  excelTableBody.value.innerHTML = "";
  buildHeader(heads);

  if (rows.length === 0) {
    renderProgress.value = 100;
    renderingTable.value = false;
    return;
  }

  let index = 0;
  const chunkSize = 150;

  const renderChunk = () => {
    if (currentTaskId !== renderTaskId || !excelTableBody.value) {
      return;
    }

    const fragment = document.createDocumentFragment();
    const end = Math.min(index + chunkSize, rows.length);

    for (; index < end; index++) {
      const row = rows[index] || [];
      const tr = document.createElement("tr");
      tr.className = "hover:bg-surface-muted transition-colors";

      for (const cell of row) {
        const cellValue = cell == null ? "" : String(cell);
        const td = document.createElement("td");
        td.innerText = cellValue;
        td.className =
          "px-3 py-2 text-sm text-foreground max-w-32 truncate border-b border-border";
        td.title = cellValue;
        tr.appendChild(td);
      }

      fragment.appendChild(tr);
    }

    excelTableBody.value.appendChild(fragment);
    renderProgress.value = Math.min(
      100,
      Math.round((index / rows.length) * 100),
    );

    if (index < rows.length) {
      requestAnimationFrame(renderChunk);
    } else {
      renderingTable.value = false;
    }
  };

  requestAnimationFrame(renderChunk);
}

function submitUpload() {
  if (flows.value.length === 0) {
    Alert.error("数据为空");
    return;
  }

  const toSend = flows.value.map((f) => ({ ...f }));
  if (attribution.value.trim()) {
    toSend.forEach((flow) => {
      flow.attribution = attribution.value.trim();
    });
  }

  if (isThirdPartyImport.value) {
    const accountId =
      selectedAccountId.value === "" || selectedAccountId.value == null
        ? undefined
        : Number(selectedAccountId.value);

    toSend.forEach((flow) => {
      flow.accountId = accountId;
      flow.origin = originLabel.value || undefined;
    });
  }

  uploading.value = true;
  doApi
    .post("api/entry/flow/imports", {
      mode: "add",
      flows: toSend,
    })
    .then((res: any) => {
      if (res && typeof res.count === "number") {
        const msg =
          res.skipped > 0
            ? `导入成功，共导入 ${res.count} 条流水，已跳过 ${res.skipped} 条重复`
            : `导入成功，共导入 ${res.count} 条流水`;
        Alert.success(msg);
        props.successCallback();
        showFlowExcelImportDialog.value = false;
      } else if (res && res.count === 0 && res.skipped > 0) {
        Alert.warning(`未新增流水，共跳过 ${res.skipped} 条重复`);
        props.successCallback();
        showFlowExcelImportDialog.value = false;
      } else {
        Alert.error("导入失败，请重试");
      }
    })
    .catch(() => {
      Alert.error("导入失败，请重试");
    })
    .finally(() => {
      uploading.value = false;
    });
}

watch(
  [() => fundAccounts.value.length, () => props.importSource],
  () => {
    if (!isThirdPartyImport.value || !fundAccounts.value.length) return;
    const matched = matchAccountId(
      fundAccounts.value,
      String(props.importSource),
    );
    if (matched != null && selectedAccountId.value === "") {
      selectedAccountId.value = matched;
    }
  },
  { immediate: true },
);

watch(
  () => [props.items, props.tableHead, props.tableBody],
  async () => {
    await renderTable();
  },
  { deep: true },
);

onMounted(async () => {
  await loadAccounts();
  if (isThirdPartyImport.value && fundAccounts.value.length) {
    const matched = matchAccountId(
      fundAccounts.value,
      String(props.importSource),
    );
    selectedAccountId.value = matched ?? "";
  }
  await renderTable();
});
</script>

<style scoped>
.overflow-auto::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.overflow-auto::-webkit-scrollbar-track {
  background-color: rgb(var(--color-surface-muted));
}

.overflow-auto::-webkit-scrollbar-thumb {
  background-color: rgb(var(--color-secondary-300));
  border-radius: 9999px;
}

.overflow-auto::-webkit-scrollbar-thumb:hover {
  background-color: rgb(var(--color-secondary-400));
}
</style>
