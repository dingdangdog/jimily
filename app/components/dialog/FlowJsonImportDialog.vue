<template>
  <!-- JSON导入对话框 -->
  <div v-if="showFlowJsonImportDialog" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
    <div
      class="bg-surface text-foreground rounded-lg shadow-xl w-full max-w-md mx-auto max-h-[90vh] overflow-y-auto border border-border"
      @click.stop>
      <!-- 标题栏 -->
      <div class="flex items-center justify-between p-2 md:p-4 border-b border-border">
        <h3 class="text-base md:text-lg font-semibold">JSON 流水导入</h3>
        <button @click="closeDialog" class="text-foreground/40 hover:text-foreground/70 transition-colors">
          <XMarkIcon class="w-5 h-5" />
        </button>
      </div>

      <!-- 表单内容 -->
      <div class="p-4 space-y-4">
        <!-- 导入模式选择 -->
        <div>
          <label class="block text-sm font-medium text-foreground/80 mb-2">
            导入模式
          </label>
          <div class="space-y-2">
            <label class="flex items-center">
              <input type="radio" v-model="importFlag" value="add"
                class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-border" />
              <span class="ml-2 text-sm text-foreground/80">
                保留原有流水
              </span>
            </label>
            <label class="flex items-center">
              <input type="radio" v-model="importFlag" value="overwrite"
                class="h-4 w-4 text-red-600 focus:ring-red-500 border-border" />
              <span class="ml-2 text-sm text-foreground/80">
                删除原有流水
              </span>
            </label>
          </div>
        </div>

        <!-- 文件选择 -->
        <div>
          <label class="block text-sm font-medium text-foreground/80 mb-2">
            选择 JSON 文件
          </label>
          <div class="relative">
            <input type="file" ref="fileInput" accept=".json" @change="onFileChange" class="hidden" />
            <button @click="() => fileInput?.click()"
              class="w-full px-3 py-2 border border-border rounded-md bg-background text-foreground hover:bg-surface transition-colors text-left flex items-center gap-2">
              <DocumentArrowUpIcon class="h-5 w-5 text-foreground/40" />
              <span class="text-sm">
                {{ jsonFile ? jsonFile.name : "点击选择 JSON 文件" }}
              </span>
            </button>
            <!-- 文件大小显示 -->
            <div v-if="jsonFile" class="mt-1 text-xs text-foreground/60">
              文件大小: {{ formatFileSize(jsonFile.size) }}
            </div>
          </div>
        </div>

        <!-- 状态提示 -->
        <div class="text-center">
          <div v-if="jsonFlows.length > 0" class="p-3 bg-primary-500/10 border border-primary-500/20 rounded-md">
            <div class="flex items-center justify-center gap-2">
              <CheckCircleIcon class="h-5 w-5 text-primary-600" />
              <span class="text-sm text-primary-700">
                共解析到 {{ jsonFlows.length }} 条流水数据，可以点击确认导入
              </span>
            </div>
          </div>
          <div v-else class="p-3 bg-surface-muted border border-border rounded-md">
            <div class="flex items-center justify-center gap-2">
              <ExclamationTriangleIcon class="h-5 w-5 text-foreground/60" />
              <span class="text-sm text-foreground/70">
                请选择要导入的 JSON 文件
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 操作按钮 -->
      <div class="flex flex-col sm:flex-row gap-3 p-4 border-t border-border bg-surface-muted">
        <button @click="closeDialog"
          class="flex-1 px-4 py-2 text-foreground/80 border border-border rounded-md hover:bg-surface transition-colors">
          取消
        </button>
        <button @click="submitImport" :disabled="!(jsonFlows.length > 0)"
          class="flex-1 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:bg-secondary-400 disabled:cursor-not-allowed transition-colors">
          确认导入
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { showFlowJsonImportDialog } from "~/utils/flag";
import { ref } from "vue";
import type { Flow } from "~/utils/table";
import {
  XMarkIcon,
  DocumentArrowUpIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/vue/24/outline";

// ESC键监听
useEscapeKey(() => {
  if (showFlowJsonImportDialog.value) {
    showFlowJsonImportDialog.value = false;
  }
}, showFlowJsonImportDialog);

const { successCallback } = defineProps(["successCallback"]);

/**
 * 文件上传相关代码
 */
const importFlag = ref("add");
const jsonFile = ref<File | null>(null);
const jsonFlows = ref<Flow[]>([]);
const fileInput = ref<HTMLInputElement>();

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
  if (firstArrayKey) {
    return obj[firstArrayKey] as any[];
  }
  return [];
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

  if (raw.payType != null) {
    flow.payType = String(raw.payType).trim();
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

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// 文件选择处理
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

// 读取json文件并导入
const readJsonInfo = () => {
  const file = jsonFile.value;
  if (!file) {
    jsonFlows.value = [];
    return;
  }
  // 创建FileReader对象
  const reader = new FileReader();

  // 设置文件读取完成后的回调函数
  reader.onload = (event) => {
    try {
      const text = String(event.target?.result || "");
      if (!text.trim()) {
        jsonFlows.value = [];
        Alert.warning("文件内容为空，请确认导出的JSON是否正确");
        return;
      }
      const parsed = JSON.parse(text);
      jsonFlows.value = normalizeJsonFlows(parsed);
      if (jsonFlows.value.length > 0) {
        Alert.success(
          "共解析到" + jsonFlows.value.length + "条流水数据，可以点击确认导入",
        );
      } else {
        Alert.warning("未发现有效流水数据，请检查文件内容");
      }
    } catch (error) {
      Alert.error("文件内容好像不太对哦");
    }
  };

  // 读取文件的内容为文本
  reader.readAsText(file);
};

const submitImport = () => {
  doApi
    .post<{ count: number; skipped?: number }>("api/entry/flow/imports", {
      mode: importFlag.value,
      flows: jsonFlows.value,
    })
    .then((res) => {
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
        Alert.error("导入失败，请检查数据！");
      }
    })
    .catch(() => {
      Alert.error("导入失败，服务出错！");
    });
};

const closeDialog = () => {
  showFlowJsonImportDialog.value = false;
};
</script>

<style scoped></style>
