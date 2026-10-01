<script setup lang="ts">
import { doApi } from "~/utils/api";
import { Alert } from "~/utils/alert";
import {
  PlusIcon,
  TrashIcon,
  PaperAirplaneIcon,
  ChatBubbleLeftRightIcon,
  Bars3Icon,
  XMarkIcon,
  ChevronLeftIcon,
  ArrowDownIcon,
  PencilSquareIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  EyeIcon,
} from "@heroicons/vue/24/outline";
import MarkdownIt from "markdown-it";

export interface ChatSession {
  id: number;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 助手消息 meta 中的记账摘要（与后端 assistantMeta.flowBookkeeping 一致） */
export interface JimiFlowBookkeepingMeta {
  action: string;
  flow: {
    id: number;
    flowNo: string | null;
    day: string;
    flowType: string | null;
    industryType: string | null;
    money: number | null;
    name: string | null;
    description: string | null;
    origin: string | null;
  };
  matchedFundAccount: { id: number; name: string } | null;
}

export interface ChatMessage {
  id: number;
  role: string;
  content: string;
  createdAt: string;
  meta?: Record<string, unknown> | null;
  /** 服务端落库的本次发送幂等键；「重试」不会复用，每次重试仍走新的一轮 */
  clientRequestId?: string | null;
  /** 本条用户消息发送时选用的服务商 ID（环境变量直连时为 null） */
  usedProviderId?: string | null;
  /** 服务商显示名快照 */
  usedProviderName?: string | null;
  /** 实际请求的 API 模型名快照 */
  usedApiModel?: string | null;
}

export interface AIProviderOption {
  id: string;
  name: string;
}

const props = withDefaults(
  defineProps<{
    isMobile?: boolean;
    showSessionList?: boolean;
    /** 移动端从「会话列表」点返回时调用的回调（返回应用） */
    mobileBackToApp?: () => void;
    /** 对话完成后的回调（用于刷新统计信息等） */
    onChatComplete?: () => void;
  }>(),
  { isMobile: false, showSessionList: true },
);

const sessions = ref<ChatSession[]>([]);
const currentSessionId = ref<number | null>(null);
const messages = ref<ChatMessage[]>([]);
const loading = ref(false);
const sending = ref(false);
const inputText = ref("");
const sessionDrawerOpen = ref(false);
/** 当前展开的会话行菜单 id（用于编辑/删除/导出合并菜单） */
const openRowMenuId = ref<number | null>(null);
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

/** AI 服务商：可选列表与当前选中 */
const aiProviders = ref<AIProviderOption[]>([]);
const selectedProviderId = ref<string | null>(null);
const selectedProviderName = ref("");

const onSelectProvider = (e: Event) => {
  const v = (e.target as HTMLSelectElement).value;
  selectedProviderId.value = v || null;
};

/** 移动端双视图：list = 会话列表全屏，chat = 对话全屏 */
const mobileView = ref<"list" | "chat">("list");

/** 对话区域滚动容器（移动端 / 桌面端各一） */
const mobileChatScrollRef = ref<HTMLElement | null>(null);
const desktopChatScrollRef = ref<HTMLElement | null>(null);

const scrollToBottom = () => {
  nextTick(() => {
    const el =
      props.isMobile && props.showSessionList && mobileView.value === "chat"
        ? mobileChatScrollRef.value
        : desktopChatScrollRef.value;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  });
};

/** 对话气泡复位：滚动到底部，避免拖动/选中导致的错位 */
const resetChatBubbles = () => {
  scrollToBottom();
};

const openDrawer = () => {
  sessionDrawerOpen.value = true;
};
const closeDrawer = () => {
  sessionDrawerOpen.value = false;
};
const selectSessionAndClose = (id: number) => {
  selectSession(id);
  if (props.isMobile) {
    closeDrawer();
    mobileView.value = "chat";
  }
};

const goToList = () => {
  mobileView.value = "list";
};
const goToChat = (id: number) => {
  selectSession(id);
  mobileView.value = "chat";
};
const createAndGoToChat = async () => {
  await createSession();
  if (props.isMobile) mobileView.value = "chat";
};

const loadProviders = async () => {
  try {
    const list = await doApi.get<AIProviderOption[]>("api/entry/ai/providers");
    aiProviders.value = list ?? [];
    const first = aiProviders.value[0];
    if (first && !selectedProviderId.value) {
      selectedProviderId.value = first.id;
    }
  } catch {
    aiProviders.value = [];
  }
};

const loadSessions = async () => {
  loading.value = true;
  try {
    const list = await doApi.get<ChatSession[]>("api/entry/ai/sessions");
    sessions.value = list ?? [];
    const firstSession = sessions.value[0];
    if (firstSession && currentSessionId.value == null && !props.isMobile) {
      currentSessionId.value = firstSession.id;
    }
  } catch {
    sessions.value = [];
  } finally {
    loading.value = false;
  }
};

const loadMessages = async (sessionId: number) => {
  if (!sessionId) {
    messages.value = [];
    return;
  }
  const prevLen = messages.value.length;
  const prevLastId = messages.value[prevLen - 1]?.id;
  loading.value = true;
  try {
    const list = await doApi.get<ChatMessage[]>(
      `api/entry/ai/sessions/${sessionId}/messages`,
    );
    messages.value = list ?? [];
  } catch {
    messages.value = [];
  } finally {
    loading.value = false;
    const nowLen = messages.value.length;
    const nowLastId = messages.value[nowLen - 1]?.id;
    if (nowLen !== prevLen || nowLastId !== prevLastId) scrollToBottom();
  }
};

const selectSession = (id: number) => {
  currentSessionId.value = id;
  loadMessages(id);
};

const createSession = async () => {
  sending.value = true;
  try {
    const session = await doApi.post<{ id: number }>("api/entry/ai/sessions");
    if (session?.id) {
      await loadSessions();
      currentSessionId.value = session.id;
      messages.value = [];
    }
  } catch {
    Alert.error("创建会话失败");
  } finally {
    sending.value = false;
  }
};

const deleteSession = async (id: number, e: Event) => {
  e.stopPropagation();
  try {
    await doApi.delete(`api/entry/ai/sessions/${id}`);
    await loadSessions();
    if (currentSessionId.value === id) {
      currentSessionId.value =
        sessions.value.find((s) => s.id !== id)?.id ?? null;
      await loadMessages(currentSessionId.value ?? 0);
    }
  } catch {
    Alert.error("删除失败");
  }
};

/** 正在编辑标题的会话 id */
const editingSessionId = ref<number | null>(null);
const editingTitle = ref("");

const startEditTitle = (s: ChatSession, e: Event) => {
  e.stopPropagation();
  editingSessionId.value = s.id;
  editingTitle.value = s.title || "新对话";
  // 延后一帧再用原生 DOM 聚焦，避免 v-for/v-if 下 ref 时机或数组问题
  setTimeout(() => {
    const input = document.querySelector<HTMLInputElement>(
      "[data-jimi-edit-title-input]",
    );
    input?.focus();
  }, 0);
};

const cancelEditTitle = () => {
  editingSessionId.value = null;
  editingTitle.value = "";
};

const saveSessionTitle = async (sessionId: number) => {
  if (editingSessionId.value === null) return;
  const title = editingTitle.value.trim() || null;
  try {
    await doApi.patch<{ title: string | null }>(
      `api/entry/ai/sessions/${sessionId}`,
      { title },
    );
    await loadSessions();
  } catch {
    Alert.error("保存标题失败");
  }
  cancelEditTitle();
};

/** 单次发送幂等键：与服务端合并并发、短时重复请求，降低重复记账风险 */
function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function postChatPayload(text: string, clientRequestId: string) {
  return doApi.post<{
    content: string;
    sessionId: number;
    assistantMeta?: Record<string, unknown> | null;
  }>("api/entry/ai/chat", {
    sessionId: currentSessionId.value ?? undefined,
    content: text,
    providerId: selectedProviderId.value ?? undefined,
    clientRequestId,
  });
}

/** 该条用户消息之后是否已有助手回复（含「对话失败」），表示这一轮已明确结束 */
function userTurnHasAssistantReply(index: number): boolean {
  return messages.value[index + 1]?.role === "assistant";
}

/**
 * 「重试」：仅当该轮已明确结束（下方有助手气泡）且当前没有别的发送在进行时可用；
 * 若本条仍在等回复（末尾用户 + sending），禁止，避免与进行中的请求叠成重复记账。
 */
function canRetryUserMessage(index: number): boolean {
  const msg = messages.value[index];
  if (msg?.role !== "user" || !String(msg.content ?? "").trim()) {
    return false;
  }
  if (sending.value) {
    return false;
  }
  if (userTurnHasAssistantReply(index)) {
    return true;
  }
  const isLast = index === messages.value.length - 1;
  if (isLast) {
    return true;
  }
  return false;
}

function userMessageRetryTitle(index: number): string {
  const msg = messages.value[index];
  if (msg?.role !== "user") {
    return "";
  }
  if (sending.value) {
    return userTurnHasAssistantReply(index)
      ? "当前有消息正在发送，请稍候再试"
      : "本轮回复尚未结束，请稍候";
  }
  if (userTurnHasAssistantReply(index)) {
    return "用相同内容再发一轮新请求（可再次记账）";
  }
  const isLast = index === messages.value.length - 1;
  if (isLast) {
    return "用相同内容再发一轮新请求（可再次记账）";
  }
  return "该条后缺少助手回复，请用输入框发送或刷新后再试";
}

const sendMessage = async () => {
  const text = inputText.value.trim();
  if (!text || sending.value) return;

  sending.value = true;
  const clientRequestId = newClientRequestId();
  inputText.value = "";
  const userMsg: ChatMessage = {
    id: 0,
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
    clientRequestId,
  };
  messages.value = [...messages.value, userMsg];
  scrollToBottom();

  try {
    const res = await postChatPayload(text, clientRequestId);
    if (res?.sessionId != null) {
      currentSessionId.value = res.sessionId;
      await loadSessions();
      await loadMessages(res.sessionId);
    } else {
      const assistantMsg: ChatMessage = {
        id: 0,
        role: "assistant",
        content: res?.content ?? "无回复",
        createdAt: new Date().toISOString(),
      };
      messages.value = [...messages.value, assistantMsg];
      scrollToBottom();
    }
    // 对话成功完成后，触发回调刷新统计信息
    props.onChatComplete?.();
  } catch {
    messages.value = messages.value.filter((m) => m !== userMsg);
    Alert.error("发送失败");
  } finally {
    sending.value = false;
  }
};

/**
 * 重试：用该条消息的**相同正文**再发起**新的一轮**对话（新的 clientRequestId），
 * 便于「昨天记过、今天再记一笔同款」等场景；与输入框发送等价，只是免打字。
 */
const retryWithMessage = async (msg: ChatMessage, index: number) => {
  if (!canRetryUserMessage(index)) return;
  const text = msg.content?.trim();
  if (!text || sending.value) return;

  sending.value = true;
  const clientRequestId = newClientRequestId();
  const userMsg: ChatMessage = {
    id: 0,
    role: "user",
    content: text,
    createdAt: new Date().toISOString(),
    clientRequestId,
  };
  messages.value = [...messages.value, userMsg];
  scrollToBottom();
  try {
    const res = await postChatPayload(text, clientRequestId);
    if (res?.sessionId != null) {
      currentSessionId.value = res.sessionId;
      await loadSessions();
      await loadMessages(res.sessionId);
    } else {
      const assistantMsg: ChatMessage = {
        id: 0,
        role: "assistant",
        content: res?.content ?? "无回复",
        createdAt: new Date().toISOString(),
      };
      messages.value = [...messages.value, assistantMsg];
      scrollToBottom();
    }
    // 对话成功完成后，触发回调刷新统计信息
    props.onChatComplete?.();
  } catch {
    messages.value = messages.value.filter((m) => m !== userMsg);
    Alert.error("发送失败");
  } finally {
    sending.value = false;
  }
};

const currentSessionTitle = computed(
  () =>
    sessions.value.find((s) => s.id === currentSessionId.value)?.title ||
    "Jimi 助手",
);

const renderAssistantMarkdown = (content: string) => {
  return md.render(content || "");
};

const bookkeepingDetail = ref<JimiFlowBookkeepingMeta | null>(null);

function getFlowBookkeepingFromMeta(
  meta: Record<string, unknown> | null | undefined,
): JimiFlowBookkeepingMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const raw = meta.flowBookkeeping;
  if (!raw || typeof raw !== "object") return null;
  const wrap = raw as Record<string, unknown>;
  const flowRaw = wrap.flow;
  if (!flowRaw || typeof flowRaw !== "object") return null;
  const f = flowRaw as Record<string, unknown>;
  const id = Number(f.id);
  if (!Number.isFinite(id)) return null;
  const acctRaw = wrap.matchedFundAccount;
  let matchedFundAccount: { id: number; name: string } | null = null;
  if (acctRaw && typeof acctRaw === "object") {
    const a = acctRaw as Record<string, unknown>;
    const aid = Number(a.id);
    const aname = a.name != null ? String(a.name) : "";
    if (Number.isFinite(aid) && aname) {
      matchedFundAccount = { id: aid, name: aname };
    }
  }
  return {
    action: String(wrap.action ?? "create"),
    flow: {
      id,
      flowNo: f.flowNo != null ? String(f.flowNo) : null,
      day: f.day != null ? String(f.day).slice(0, 10) : "",
      flowType: f.flowType != null ? String(f.flowType) : null,
      industryType: f.industryType != null ? String(f.industryType) : null,
      money: f.money != null ? Number(f.money) : null,
      name: f.name != null ? String(f.name) : null,
      description: f.description != null ? String(f.description) : null,
      origin: f.origin != null ? String(f.origin) : null,
    },
    matchedFundAccount,
  };
}

const openBookkeepingDetail = (payload: JimiFlowBookkeepingMeta) => {
  bookkeepingDetail.value = payload;
};
const closeBookkeepingDetail = () => {
  bookkeepingDetail.value = null;
};

const formatMoney = (n: number | null | undefined) => {
  if (n == null || Number.isNaN(Number(n))) return "—";
  return `${Math.abs(Number(n)).toFixed(2)} 元`;
};

/** 用户消息气泡与导出：展示发送时落库的服务商名 + API 模型 */
const userModelSnapshotLine = (msg: ChatMessage): string => {
  if (msg.role !== "user") return "";
  const name = msg.usedProviderName?.trim();
  const api = msg.usedApiModel?.trim();
  if (name && api) return `${name} · ${api}`;
  if (name) return name;
  if (api) return api;
  return "";
};

const buildChatMarkdown = () => {
  const lines: string[] = [];
  const title = currentSessionTitle.value || "Jimi 对话";
  const sessionId = currentSessionId.value;
  const provider = selectedProviderName.value || "默认模型";

  lines.push(`# ${title}`);
  lines.push("");
  if (sessionId) {
    lines.push(`- 会话 ID：${sessionId}`);
  }
  lines.push(`- 使用模型：${provider}`);
  lines.push(
    `- 导出时间：${new Date().toLocaleString(undefined, {
      hour12: false,
    })}`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  for (const msg of messages.value) {
    const roleLabel =
      msg.role === "user"
        ? "用户"
        : msg.role === "assistant"
          ? "Jimi"
          : msg.role || "其他";
    let timeText = "";
    if (msg.createdAt) {
      const d = new Date(msg.createdAt);
      if (!Number.isNaN(d.getTime())) {
        timeText = d.toLocaleString(undefined, { hour12: false });
      }
    }
    lines.push(
      `### ${roleLabel}${timeText ? `（${timeText}）` : ""}`,
    );
    lines.push("");
    const content = msg.content?.trim() || "（无内容）";
    lines.push(content);
    lines.push("");
    if (msg.role === "user") {
      const snap = userModelSnapshotLine(msg);
      if (snap) {
        lines.push(`- 发送时模型：${snap}`);
        lines.push("");
      }
    }
  }

  return lines.join("\n");
};

const exportChatMarkdown = () => {
  if (!messages.value.length) {
    Alert.warning("当前没有可导出的对话内容");
    return;
  }
  const mdText = buildChatMarkdown();
  try {
    const blob = new Blob([mdText], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const rawTitle = currentSessionTitle.value || "Jimi 对话";
    const safeTitle = rawTitle
      .replace(/[\\/:*?"<>|]/g, "_")
      .slice(0, 40);
    const ts = new Date()
      .toISOString()
      .slice(0, 19)
      .replace(/[-T:]/g, "");
    a.href = url;
    a.download = `${safeTitle || "Jimi对话"}-${ts}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Alert.success("已导出对话为 Markdown 文件");
  } catch {
    Alert.error("导出失败，请稍后重试");
  }
};

onMounted(() => {
  loadProviders();
  loadSessions();
});

watch(selectedProviderId, (id) => {
  if (id) {
    const p = aiProviders.value.find((x) => x.id === id);
    if (p) selectedProviderName.value = p.name;
  } else {
    selectedProviderName.value = "";
  }
});

watch(
  () => currentSessionId.value,
  (id) => {
    if (id) loadMessages(id);
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex h-full min-h-0 bg-background text-foreground">
    <Teleport to="body">
      <div v-if="bookkeepingDetail" class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
        role="dialog" aria-modal="true" aria-labelledby="jimi-bookkeeping-detail-title"
        @click.self="closeBookkeepingDetail">
        <div
          class="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-xl border border-border bg-surface p-4 text-foreground shadow-xl"
          @click.stop>
          <div class="mb-3 flex items-center justify-between border-b border-border pb-2">
            <h3 id="jimi-bookkeeping-detail-title" class="text-base font-semibold">
              记账详情
            </h3>
            <button type="button"
              class="rounded-full p-1.5 text-foreground/60 hover:bg-surface-muted hover:text-foreground" aria-label="关闭"
              @click="closeBookkeepingDetail">
              <XMarkIcon class="h-5 w-5" />
            </button>
          </div>
          <dl class="space-y-2.5 text-sm">
            <div class="flex justify-between gap-3">
              <dt class="shrink-0 text-foreground/55">条目</dt>
              <dd class="text-right font-medium">
                {{ bookkeepingDetail.flow.name || "—" }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="shrink-0 text-foreground/55">金额</dt>
              <dd class="text-right font-medium">
                {{ formatMoney(bookkeepingDetail.flow.money) }}
                <span v-if="bookkeepingDetail.flow.flowType" class="text-foreground/60">
                  （{{ bookkeepingDetail.flow.flowType }}）</span>
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="shrink-0 text-foreground/55">分类</dt>
              <dd class="text-right">
                {{ bookkeepingDetail.flow.industryType || "—" }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="shrink-0 text-foreground/55">日期</dt>
              <dd class="text-right">
                {{ bookkeepingDetail.flow.day || "—" }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="shrink-0 text-foreground/55">资金账户</dt>
              <dd class="text-right">
                {{
                  bookkeepingDetail.matchedFundAccount?.name || "—"
                }}
              </dd>
            </div>
            <div v-if="bookkeepingDetail.flow.description" class="flex justify-between gap-3">
              <dt class="shrink-0 text-foreground/55">备注</dt>
              <dd class="text-right">
                {{ bookkeepingDetail.flow.description }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt class="shrink-0 text-foreground/55">流水号</dt>
              <dd class="break-all text-right text-xs text-foreground/70">
                {{ bookkeepingDetail.flow.flowNo || `ID ${bookkeepingDetail.flow.id}` }}
              </dd>
            </div>
            <div v-if="bookkeepingDetail.flow.origin" class="flex justify-between gap-3">
              <dt class="shrink-0 text-foreground/55">来源</dt>
              <dd class="text-right text-foreground/80">
                {{ bookkeepingDetail.flow.origin }}
              </dd>
            </div>
          </dl>
          <p class="mt-4 text-xs text-foreground/50">
            {{
              bookkeepingDetail.action === "update"
                ? "以上为更新后的流水信息。"
                : "本次通过助手新记的流水。"
            }}
          </p>
        </div>
      </div>
    </Teleport>
    <!-- ========== 移动端：全屏双视图（先列表 or 对话） ========== -->
    <template v-if="isMobile && showSessionList">
      <!-- 视图：会话列表（类似微信对话列表） -->
      <div v-show="mobileView === 'list'" class="flex h-full w-full flex-col">
        <header
          class="flex flex-shrink-0 items-center gap-3 border-b border-border bg-surface px-3 py-2 pt-[env(safe-area-inset-top)]"
          style="padding-top: max(0.5rem, env(safe-area-inset-top))">
          <button type="button"
            class="-ml-1 flex items-center justify-center rounded-full p-2 text-foreground hover:bg-surface-muted active:opacity-80"
            aria-label="返回" @click="mobileBackToApp?.()">
            <ChevronLeftIcon class="h-6 w-6" />
          </button>
          <h1 class="flex-1 text-center text-base font-semibold">对话</h1>
          <button type="button" class="rounded-full p-2 text-primary-600 hover:bg-primary-500/15 active:opacity-80"
            aria-label="新对话" @click="createAndGoToChat">
            <PlusIcon class="h-6 w-6" />
          </button>
        </header>
        <div class="flex-1 overflow-y-auto">
          <template v-if="loading && sessions.length === 0">
            <div class="flex flex-col items-center justify-center py-16 text-foreground/50">
              <span class="text-sm">加载中...</span>
            </div>
          </template>
          <template v-else-if="sessions.length === 0">
            <div class="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center text-foreground/60">
              <ChatBubbleLeftRightIcon class="h-14 w-14" />
              <p class="text-sm">暂无对话</p>
              <button type="button" class="rounded-full bg-primary-500 px-5 py-2 text-sm font-medium text-white"
                @click="createAndGoToChat">
                开始新对话
              </button>
            </div>
          </template>
          <ul v-else class="divide-y divide-border">
            <li v-for="s in sessions" :key="s.id"
              class="flex items-center gap-3 bg-surface px-4 py-3 active:bg-surface-muted">
              <button type="button" class="flex min-w-0 flex-1 items-center gap-3 text-left" @click="goToChat(s.id)">
                <div
                  class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-500/20 text-primary-600">
                  <ChatBubbleLeftRightIcon class="h-5 w-5" />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-[15px] font-medium text-foreground">
                    {{ s.title || "新对话" }}
                  </p>
                  <p class="truncate text-xs text-foreground/50">对话</p>
                </div>
              </button>
              <div class="relative flex-shrink-0">
                <button type="button"
                  class="rounded-full p-2 text-foreground/40 hover:bg-surface-muted hover:text-foreground"
                  aria-label="更多" :aria-expanded="openRowMenuId === s.id"
                  @click.stop="openRowMenuId = openRowMenuId === s.id ? null : s.id">
                  <EllipsisVerticalIcon class="h-5 w-5" />
                </button>
                <Teleport to="body">
                  <div v-if="openRowMenuId === s.id" class="fixed inset-0 z-40" @click="openRowMenuId = null" />
                </Teleport>
                <div v-if="openRowMenuId === s.id"
                  class="absolute right-0 top-full z-50 mt-1 min-w-[9rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
                  @click.stop>
                  <button type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                    @click="openRowMenuId = null; startEditTitle(s, $event)">
                    <PencilSquareIcon class="h-4 w-4" /> 编辑标题
                  </button>
                  <button v-if="currentSessionId === s.id" type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                    @click="openRowMenuId = null; exportChatMarkdown()">
                    <DocumentTextIcon class="h-4 w-4" /> 导出对话
                  </button>
                  <button type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                    @click="openRowMenuId = null; deleteSession(s.id, $event)">
                    <TrashIcon class="h-4 w-4" /> 删除
                  </button>
                </div>
              </div>
            </li>
          </ul>
        </div>
      </div>

      <!-- 视图：对话（全屏聊天） -->
      <div v-show="mobileView === 'chat'" class="flex h-full w-full flex-col">
        <header class="flex flex-shrink-0 items-center gap-2 border-b border-border bg-surface px-2 py-2"
          style="padding-top: max(0.5rem, env(safe-area-inset-top))">
          <button type="button"
            class="flex items-center justify-center rounded-full p-2 text-foreground hover:bg-surface-muted active:opacity-80"
            aria-label="返回对话列表" @click="goToList">
            <ChevronLeftIcon class="h-6 w-6" />
          </button>
          <h2 class="min-w-0 flex-1 truncate text-center text-base font-semibold">
            {{ currentSessionTitle }}
          </h2>
          <button type="button"
            class="flex-shrink-0 rounded-full p-2 text-foreground/60 hover:bg-surface-muted hover:text-foreground"
            aria-label="复位对话" title="复位到底部" @click="resetChatBubbles">
            <ArrowDownIcon class="h-5 w-5" />
          </button>
        </header>
        <!-- 移动端对话页：当前 AI 服务商 -->
        <div v-if="aiProviders.length > 0"
          class="flex flex-shrink-0 items-center gap-2 border-b border-border bg-surface-muted/50 px-3 py-2">
          <span class="text-xs text-foreground/60">当前模型</span>
          <select :value="selectedProviderId ?? ''"
            class="flex-1 min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
            aria-label="选择模型" @change="onSelectProvider">
            <option v-for="p in aiProviders" :key="p.id" :value="p.id">
              {{ p.name }}
            </option>
          </select>
        </div>
        <div ref="mobileChatScrollRef"
          class="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4 touch-pan-y select-text">
          <template v-if="!currentSessionId && messages.length === 0">
            <div class="flex flex-col items-center justify-center gap-4 py-12 text-center text-foreground/60">
              <ChatBubbleLeftRightIcon class="h-14 w-14" />
              <p class="text-sm">
                直接说「记一笔午饭
                50」或「添加资金账户：微信、支付宝、招商银行卡」
              </p>
            </div>
          </template>
          <template v-else>
            <div class="space-y-3">
              <template v-for="(msg, i) in messages" :key="i">
                <div class="flex" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
                  <div class="max-w-[82%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug" :class="msg.role === 'user'
                    ? 'group rounded-br-md bg-primary-500 text-white'
                    : 'rounded-bl-md bg-surface-muted text-foreground'
                    ">
                    <template v-if="msg.role === 'assistant'">
                      <div class="jimi-markdown break-words" v-html="renderAssistantMarkdown(msg.content)" />
                      <div v-if="getFlowBookkeepingFromMeta(msg.meta)" class="mt-2 flex border-t border-border/50 pt-2">
                        <button type="button"
                          class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-500/10 active:opacity-90"
                          @click.stop="
                            openBookkeepingDetail(
                              getFlowBookkeepingFromMeta(msg.meta)!,
                            )
                            ">
                          <EyeIcon class="h-3.5 w-3.5" />
                          查看详情
                        </button>
                      </div>
                    </template>
                    <template v-else>
                      <div class="whitespace-pre-wrap break-words">
                        {{ msg.content }}
                      </div>
                      <p v-if="userModelSnapshotLine(msg)"
                        class="mt-1 text-[11px] leading-tight text-white/55">
                        {{ userModelSnapshotLine(msg) }}
                      </p>
                      <div class="mt-2 flex justify-end border-t border-white/20 pt-1.5">
                        <button type="button"
                          class="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs opacity-80 transition hover:bg-white/20 hover:opacity-100 active:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                          :disabled="!canRetryUserMessage(i)"
                          :title="userMessageRetryTitle(i)"
                          @click.stop="retryWithMessage(msg, i)">
                          <ArrowPathIcon class="h-3.5 w-3.5" />
                          重试
                        </button>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
              <div v-if="sending && messages[messages.length - 1]?.role === 'user'" class="flex justify-start">
                <div
                  class="max-w-[90%] rounded-2xl rounded-bl-md bg-surface-muted px-4 py-2.5 text-[15px] text-foreground/60">
                  <p class="font-medium text-foreground/70">正在回复…</p>
                  <p class="mt-1.5 text-xs leading-snug text-foreground/45">
                    请勿连点发送。
                  </p>
                </div>
              </div>
            </div>
          </template>
        </div>
        <div class="flex-shrink-0 border-t border-border bg-surface px-3 pb-3 pt-2"
          style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))">
          <form class="flex items-end gap-2" @submit.prevent="sendMessage">
            <input v-model="inputText" type="text" placeholder="输入消息..."
              class="min-h-[44px] flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-[15px] text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              :disabled="sending" />
            <button type="submit"
              class="flex h-[44px] w-[44px] flex-shrink-0 items-center justify-center rounded-full bg-primary-500 text-white shadow-sm transition active:opacity-90 disabled:opacity-40"
              :disabled="sending || !inputText.trim()">
              <PaperAirplaneIcon class="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </template>

    <!-- ========== 桌面端：侧栏 + 消息区 ========== -->
    <template v-else>
      <template v-if="showSessionList">
        <div v-if="isMobile && sessionDrawerOpen" class="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-hidden
          @click="closeDrawer"></div>
        <aside
          class="flex flex-shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 ease-out"
          :class="isMobile ? 'fixed inset-y-0 left-0 z-50 w-72 shadow-xl' : 'w-64'
            " :style="isMobile && !sessionDrawerOpen
              ? { transform: 'translateX(-100%)' }
              : undefined
              ">
          <div class="flex items-center justify-between border-b border-border px-3 py-2">
            <span class="text-sm font-medium text-foreground/80">对话记录</span>
            <div class="flex items-center gap-1">
              <button type="button" class="rounded p-1 text-foreground/60 hover:bg-surface-muted hover:text-foreground"
                title="新对话" @click="createSession">
                <PlusIcon class="h-5 w-5" />
              </button>
              <button v-if="isMobile" type="button"
                class="rounded p-1 text-foreground/60 hover:bg-surface-muted hover:text-foreground" aria-label="关闭"
                @click="closeDrawer">
                <XMarkIcon class="h-5 w-5" />
              </button>
            </div>
          </div>
          <div class="flex-1 overflow-y-auto">
            <template v-if="loading && sessions.length === 0">
              <div class="p-4 text-center text-sm text-foreground/50">
                加载中...
              </div>
            </template>
            <template v-else-if="sessions.length === 0">
              <div class="p-4 text-center text-sm text-foreground/50">
                暂无对话，发送消息将自动创建
              </div>
            </template>
            <div v-for="s in sessions" :key="s.id"
              class="flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left text-sm transition hover:bg-surface-muted"
              :class="{
                'bg-primary-500/15 text-primary-700': currentSessionId === s.id,
              }">
              <template v-if="editingSessionId === s.id">
                <input data-jimi-edit-title-input v-model="editingTitle" type="text"
                  class="min-w-0 flex-1 rounded border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="标题" maxlength="200" @click.stop @keydown.enter.prevent="saveSessionTitle(s.id)"
                  @keydown.escape="cancelEditTitle" @blur="saveSessionTitle(s.id)" />
              </template>
              <template v-else>
                <button type="button" class="min-w-0 flex-1 truncate text-left" @click="
                  isMobile ? selectSessionAndClose(s.id) : selectSession(s.id)
                  ">
                  {{ s.title || "新对话" }}
                </button>
              </template>
              <div v-if="editingSessionId !== s.id" class="relative flex-shrink-0">
                <button type="button"
                  class="rounded p-0.5 text-foreground/50 hover:bg-surface-muted hover:text-foreground" aria-label="更多"
                  :aria-expanded="openRowMenuId === s.id"
                  @click.stop="openRowMenuId = openRowMenuId === s.id ? null : s.id">
                  <EllipsisVerticalIcon class="h-4 w-4" />
                </button>
                <Teleport to="body">
                  <div v-if="openRowMenuId === s.id" class="fixed inset-0 z-40" @click="openRowMenuId = null" />
                </Teleport>
                <div v-if="openRowMenuId === s.id"
                  class="absolute right-0 top-full z-50 mt-1 min-w-[9rem] rounded-lg border border-border bg-surface py-1 shadow-lg"
                  @click.stop>
                  <button type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                    @click="openRowMenuId = null; startEditTitle(s, $event)">
                    <PencilSquareIcon class="h-4 w-4" /> 编辑标题
                  </button>
                  <button v-if="currentSessionId === s.id" type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                    @click="openRowMenuId = null; exportChatMarkdown()">
                    <DocumentTextIcon class="h-4 w-4" /> 导出对话
                  </button>
                  <button type="button"
                    class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
                    @click="openRowMenuId = null; deleteSession(s.id, $event)">
                    <TrashIcon class="h-4 w-4" /> 删除
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </template>

      <div class="flex flex-1 flex-col min-w-0">
        <!-- 桌面端：AI 服务商选择 -->
        <div v-if="!isMobile && aiProviders.length > 0"
          class="flex flex-shrink-0 items-center gap-3 border-b border-border bg-surface-muted/50 px-4 py-2">
          <span class="text-sm text-foreground/70">当前模型</span>
          <div class="w-48">
            <select :value="selectedProviderId ?? ''"
              class="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              aria-label="选择模型" @change="onSelectProvider">
              <option v-for="p in aiProviders" :key="p.id" :value="p.id">
                {{ p.name }}
              </option>
            </select>
          </div>
        </div>
        <div v-if="showSessionList && isMobile"
          class="flex flex-shrink-0 items-center gap-2 border-b border-border bg-surface px-3 py-2">
          <button type="button" class="rounded p-1.5 text-foreground/80 hover:bg-surface-muted" aria-label="对话列表"
            @click="openDrawer">
            <Bars3Icon class="h-5 w-5" />
          </button>
          <span class="min-w-0 flex-1 truncate text-sm text-foreground/80">
            {{ currentSessionTitle }}
          </span>
        </div>
        <div v-if="!currentSessionId && messages.length === 0"
          class="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-foreground/60">
          <ChatBubbleLeftRightIcon class="h-16 w-16" />
          <p class="text-sm">
            我是 Jimi，你的记账助手。直接说「记一笔午饭
            50」、「本月花了多少」或「添加资金账户：微信、支付宝、银行卡」即可。
          </p>
          <p class="text-xs">发送任意消息将自动创建新对话。</p>
        </div>

        <div ref="desktopChatScrollRef" v-else
          class="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 touch-pan-y select-text">
          <template v-for="(msg, i) in messages" :key="i">
            <div class="flex gap-3" :class="msg.role === 'user' ? 'justify-end' : 'justify-start'">
              <div class="max-w-[85%] rounded-lg px-3 py-2 text-sm" :class="msg.role === 'user'
                ? 'group bg-primary-500 text-white'
                : 'bg-surface-muted text-foreground'
                ">
                <template v-if="msg.role === 'assistant'">
                  <div class="jimi-markdown break-words" v-html="renderAssistantMarkdown(msg.content)" />
                  <div v-if="getFlowBookkeepingFromMeta(msg.meta)" class="mt-2 flex border-t border-border/50 pt-2">
                    <button type="button"
                      class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-500/10 active:opacity-90"
                      @click.stop="
                        openBookkeepingDetail(
                          getFlowBookkeepingFromMeta(msg.meta)!,
                        )
                        ">
                      <EyeIcon class="h-3.5 w-3.5" />
                      查看详情
                    </button>
                  </div>
                </template>
                <template v-else>
                  <div class="whitespace-pre-wrap break-words">
                    {{ msg.content }}
                  </div>
                  <p v-if="userModelSnapshotLine(msg)"
                    class="mt-1 text-[11px] leading-tight text-white/55">
                    {{ userModelSnapshotLine(msg) }}
                  </p>
                  <div class="mt-1.5 flex justify-end border-t border-white/20 pt-1">
                    <button type="button"
                      class="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs opacity-70 transition hover:bg-white/20 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                      :disabled="!canRetryUserMessage(i)"
                      :title="userMessageRetryTitle(i)"
                      @click.stop="retryWithMessage(msg, i)">
                      <ArrowPathIcon class="h-3 w-3" />
                      重试
                    </button>
                  </div>
                </template>
              </div>
            </div>
          </template>
          <div v-if="sending && messages[messages.length - 1]?.role === 'user'" class="flex justify-start">
            <div class="max-w-[min(100%,28rem)] rounded-lg bg-surface-muted px-3 py-2 text-sm text-foreground/60">
              <p class="font-medium text-foreground/70">思考中…</p>
              <p class="mt-1 text-xs leading-relaxed text-foreground/45">
                请勿连点发送。
              </p>
            </div>
          </div>
        </div>

        <div class="flex flex-shrink-0 items-center gap-2 border-t border-border bg-surface p-3">
          <form class="flex flex-1 gap-2" @submit.prevent="sendMessage">
            <input v-model="inputText" type="text" placeholder="输入消息，如：记一笔午饭50，或添加资金账户：微信、支付宝"
              class="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary-500"
              :disabled="sending" />
            <button type="submit"
              class="flex-shrink-0 rounded-lg bg-primary-500 px-4 py-2 text-white transition hover:bg-primary-600 disabled:opacity-50"
              :disabled="sending || !inputText.trim()">
              <PaperAirplaneIcon class="h-5 w-5" />
            </button>
          </form>
          <button type="button"
            class="flex-shrink-0 rounded-lg border border-border px-2 py-2 text-foreground/70 hover:bg-surface-muted hover:text-foreground"
            aria-label="复位对话" title="复位到底部" @click="resetChatBubbles">
            <ArrowDownIcon class="h-5 w-5" />
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.jimi-markdown :deep(p) {
  margin: 0 0 0.45rem;
}

.jimi-markdown :deep(p:last-child) {
  margin-bottom: 0;
}

.jimi-markdown :deep(ul),
.jimi-markdown :deep(ol) {
  margin: 0.3rem 0 0.45rem 1.1rem;
}

.jimi-markdown :deep(li) {
  margin: 0.2rem 0;
}

.jimi-markdown :deep(code) {
  border-radius: 0.25rem;
  background: rgba(148, 163, 184, 0.2);
  padding: 0.1rem 0.3rem;
  font-size: 0.9em;
}

.jimi-markdown :deep(pre) {
  overflow-x: auto;
  border-radius: 0.5rem;
  background: rgba(148, 163, 184, 0.15);
  padding: 0.6rem;
}

.jimi-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}

.jimi-markdown :deep(a) {
  color: #2563eb;
  text-decoration: underline;
}
</style>
