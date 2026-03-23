<script setup lang="ts">
definePageMeta({
  layout: "public",
  middleware: ["auth"],
});

import { XMarkIcon } from "@heroicons/vue/24/outline";
import {
  issueApiToken,
  type ApiTokenExpiryPreset,
  type IssueApiTokenResult,
} from "~/utils/user-api-token";
import {
  formatProbeBody,
  isBizNoPermission,
  isBizSuccess,
  runApiTokenTestSuite,
  type ApiTokenProbeResult,
} from "~/utils/api-token-test";

const userStore = useUserStore();

const expiryOptions: { value: ApiTokenExpiryPreset; label: string }[] = [
  { value: "30d", label: "30 天" },
  { value: "360d", label: "360 天" },
  { value: "forever", label: "无限期（JWT 不含过期时间）" },
];

const expiry = ref<ApiTokenExpiryPreset>("30d");
const issuing = ref(false);
const result = ref<IssueApiTokenResult | null>(null);

const testDialogOpen = ref(false);
const testToken = ref("");
const testLoading = ref(false);
const testEntry = ref<ApiTokenProbeResult | null>(null);
const testAdmin = ref<ApiTokenProbeResult | null>(null);
const testV1Ai = ref<ApiTokenProbeResult | null>(null);
const testRunError = ref("");

useEscapeKey(() => {
  if (testDialogOpen.value) testDialogOpen.value = false;
}, testDialogOpen);

const issue = () => {
  issuing.value = true;
  result.value = null;
  issueApiToken({ expiry: expiry.value })
    .then((res) => {
      result.value = res;
      Alert.success("令牌已生成，请妥善保管（仅显示一次）");
    })
    .catch(() => { })
    .finally(() => {
      issuing.value = false;
    });
};

const copyText = (text: string) => {
  navigator.clipboard.writeText(text).then(() => {
    Alert.success("已复制到剪贴板");
  });
};

const openTestDialog = () => {
  testRunError.value = "";
  testEntry.value = null;
  testAdmin.value = null;
  testV1Ai.value = null;
  if (!testToken.value.trim() && result.value?.token) {
    testToken.value = result.value.token;
  }
  testDialogOpen.value = true;
};

const closeTestDialog = () => {
  testDialogOpen.value = false;
};

const fillLatestToken = () => {
  if (result.value?.token) {
    testToken.value = result.value.token;
    Alert.success("已填入当前页生成的令牌");
  } else {
    Alert.error("请先生成令牌");
  }
};

const runTokenTest = async () => {
  const t = testToken.value.trim();
  if (!t) {
    Alert.error("请先粘贴或填入 Token");
    return;
  }
  testLoading.value = true;
  testRunError.value = "";
  testEntry.value = null;
  testAdmin.value = null;
  testV1Ai.value = null;
  try {
    const suite = await runApiTokenTestSuite(window.location.origin, t);
    testEntry.value = suite.entry;
    testAdmin.value = suite.admin;
    testV1Ai.value = suite.v1AiConversations;
  } catch (e: unknown) {
    testRunError.value =
      e instanceof Error ? e.message : String(e ?? "请求失败");
    Alert.error("测试请求失败");
  } finally {
    testLoading.value = false;
  }
};

const probeVerdict = (r: ApiTokenProbeResult) => {
  if (isBizSuccess(r.body)) return { ok: true, text: "有权限（c=200）" };
  if (isBizNoPermission(r.body)) {
    const m = (r.body as { m?: string }).m || "";
    return { ok: false, text: `无权限或未授权（c=400）${m ? `：${m}` : ""}` };
  }
  return { ok: false, text: "异常响应" };
};

const testSummaryLines = computed(() => {
  const lines: string[] = [];
  if (!testEntry.value || !testAdmin.value || !testV1Ai.value) return lines;
  const eOk = isBizSuccess(testEntry.value.body);
  const aOk = isBizSuccess(testAdmin.value.body);
  const v1Ok = isBizSuccess(testV1Ai.value.body);
  if (!eOk) {
    lines.push("· 普通用户接口未通过：Token 可能无效、过期，或服务不可达。");
    return lines;
  }
  lines.push("· 普通用户接口：通过（Token 具备有效用户身份）。");
  if (v1Ok) {
    lines.push("· v1 AI 对话列表：通过（可调用 /api/v1/ai/conversations）。");
  } else {
    lines.push("· v1 AI 对话列表：未通过，请查看详情（部署或路由异常时可能出现）。");
  }
  if (aOk) {
    lines.push("· 管理员接口：通过（该 Token 对应账号含 admin，可访问管理端）。");
  } else if (isBizNoPermission(testAdmin.value.body)) {
    lines.push(
      "· 管理员接口：拒绝（非管理员账号时属预期，不应能调 /api/admin）。",
    );
  } else {
    lines.push("· 管理员接口：结果见上方详情。");
  }
  return lines;
});
</script>

<template>
  <div class="p-2 md:p-4 bg-surface-muted min-h-full">
    <div class="bg-surface rounded-lg shadow-sm border border-border overflow-hidden max-w-3xl">
      <div class="px-4 py-3 border-b border-border bg-surface-muted/50">
        <h2 class="text-lg font-semibold text-foreground">API 访问令牌</h2>
        <p class="text-sm text-muted mt-0.5">
          为当前账号（{{
            userStore.user?.username || "…"
          }}）生成 JWT，用于自行调用
          <code class="text-xs bg-surface-muted px-1 rounded">/api/entry</code>
          、<code class="text-xs bg-surface-muted px-1 rounded">/api/v1/ai</code>
          等接口。
        </p>
      </div>

      <div class="p-4 md:p-6 space-y-4">
        <div>
          <label class="block text-sm font-medium text-foreground mb-2">
            令牌有效期
          </label>
          <select v-model="expiry"
            class="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500">
            <option v-for="opt in expiryOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>

        <div class="flex flex-wrap gap-2">
          <button type="button"
            class="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
            :disabled="issuing" @click="issue">
            {{ issuing ? "生成中…" : "生成令牌" }}
          </button>
          <button type="button"
            class="px-4 py-2 rounded-lg border border-border bg-surface text-foreground text-sm font-medium hover:bg-surface-muted/80"
            @click="openTestDialog">
            测试令牌
          </button>
        </div>

        <div v-if="result" class="mt-4 p-4 rounded-lg border border-border bg-surface-muted/40 space-y-3">
          <div class="text-sm text-foreground">
            <span class="text-muted">用户：</span>
            {{ result.user.username }}（ID {{ result.user.id }}）
          </div>
          <div class="text-sm text-foreground">
            <span class="text-muted">有效期策略：</span>
            {{ result.expiryPreset }}
            <span v-if="result.expiresAt" class="text-muted">
              · 到期（UTC）：{{ result.expiresAt }}
            </span>
            <span v-else class="text-muted"> · 无过期时间</span>
          </div>
          <div>
            <div class="flex items-center justify-between mb-1">
              <span class="text-sm font-medium text-foreground">Token</span>
              <button type="button" class="text-xs text-primary-600 hover:underline" @click="copyText(result.token)">
                复制
              </button>
            </div>
            <textarea readonly rows="4"
              class="w-full text-xs font-mono px-3 py-2 border border-border rounded-lg bg-surface text-foreground"
              :value="result.token" />
          </div>
          <p class="text-xs text-muted">
            也可在命令行执行
            <code class="bg-surface-muted px-1 rounded">node scripts/test-api-token.mjs</code>
            （环境变量传入 Token）。
          </p>
        </div>
      </div>
    </div>

    <!-- 测试令牌弹窗 -->
    <Teleport to="body">
      <div v-if="testDialogOpen" class="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-black/50"
        @click.self="closeTestDialog">
        <div
          class="bg-surface text-foreground rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-border"
          @click.stop>
          <div class="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <h3 class="text-base font-semibold">测试 API 令牌</h3>
            <button type="button" class="p-1 rounded-md text-foreground/50 hover:text-foreground hover:bg-surface-muted"
              aria-label="关闭" @click="closeTestDialog">
              <XMarkIcon class="w-5 h-5" />
            </button>
          </div>

          <div class="p-4 space-y-3 overflow-y-auto flex-1 min-h-0">
            <p class="text-xs text-muted leading-relaxed">
              将使用填写的token自动请求当前站点。
            </p>

            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-sm font-medium text-foreground">Token</label>
                <button type="button" class="text-xs text-primary-600 hover:underline" @click="fillLatestToken">
                  填入刚生成的令牌
                </button>
              </div>
              <textarea v-model="testToken" rows="4" placeholder="粘贴 JWT…"
                class="w-full text-xs font-mono px-3 py-2 border border-border rounded-lg bg-surface text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>

            <div class="flex flex-wrap gap-2">
              <button type="button"
                class="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                :disabled="testLoading" @click="runTokenTest">
                {{ testLoading ? "测试中…" : "执行测试" }}
              </button>
            </div>

            <p v-if="testRunError" class="text-sm text-red-600 dark:text-red-400">
              {{ testRunError }}
            </p>

            <template v-if="testEntry">
              <div class="rounded-lg border border-border bg-surface-muted/40 p-3 space-y-1 text-xs">
                <div class="font-semibold text-foreground">
                  【{{ testEntry.label }}】 {{ testEntry.method }} {{ testEntry.path }}
                </div>
                <div class="text-muted break-all">HTTP {{ testEntry.status }}</div>
                <div class="font-medium"
                  :class="probeVerdict(testEntry).ok ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-300'">
                  {{ probeVerdict(testEntry).text }}
                </div>
                <pre
                  class="mt-2 p-2 rounded bg-surface border border-border text-[11px] overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{{ formatProbeBody(testEntry.body) }}</pre>
              </div>
            </template>

            <template v-if="testV1Ai">
              <div class="rounded-lg border border-border bg-surface-muted/40 p-3 space-y-1 text-xs">
                <div class="font-semibold text-foreground">
                  【{{ testV1Ai.label }}】 {{ testV1Ai.method }} {{ testV1Ai.path }}
                </div>
                <div class="text-muted break-all">HTTP {{ testV1Ai.status }}</div>
                <div class="font-medium"
                  :class="probeVerdict(testV1Ai).ok ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-300'">
                  {{ probeVerdict(testV1Ai).text }}
                </div>
                <pre
                  class="mt-2 p-2 rounded bg-surface border border-border text-[11px] overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{{ formatProbeBody(testV1Ai.body) }}</pre>
              </div>
            </template>

            <template v-if="testAdmin">
              <div class="rounded-lg border border-border bg-surface-muted/40 p-3 space-y-1 text-xs">
                <div class="font-semibold text-foreground">
                  【{{ testAdmin.label }}】 {{ testAdmin.method }} {{ testAdmin.path }}
                </div>
                <div class="text-muted break-all">HTTP {{ testAdmin.status }}</div>
                <div class="font-medium"
                  :class="probeVerdict(testAdmin).ok ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-300'">
                  {{ probeVerdict(testAdmin).text }}
                </div>
                <pre
                  class="mt-2 p-2 rounded bg-surface border border-border text-[11px] overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap break-words">{{ formatProbeBody(testAdmin.body) }}</pre>
              </div>
            </template>

            <div v-if="testSummaryLines.length"
              class="rounded-lg border border-primary-200 dark:border-primary-800 bg-primary-50/80 dark:bg-primary-950/30 p-3 text-xs text-foreground space-y-1">
              <div class="font-semibold">汇总</div>
              <p v-for="(line, i) in testSummaryLines" :key="i" class="leading-relaxed">
                {{ line }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
