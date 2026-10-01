<script setup lang="ts">
import { doApi } from "~/utils/api";
import { exportJson } from "~/utils/fileUtils";
import {
  downloadInvoicesZipBlob,
  fetchDatabaseBackupPayload,
  importDatabaseBackupFile,
  importInvoicesZipFile,
} from "./backup-api";

/** 恢复后旧 JWT 与库中用户可能不一致，需清 Cookie 并跳转登录 */
async function logoutAndGoLogin() {
  try {
    await doApi.get("api/logout");
  } catch {
    const auth = useCookie("Authorization");
    const admin = useCookie("Admin");
    auth.value = null;
    admin.value = null;
  }
  useUserStore().clearUser();
  await navigateTo({ path: "/login", replace: true });
}

const dbExporting = ref(false);
const dbImporting = ref(false);
const zipExporting = ref(false);
const zipImporting = ref(false);

const dbFileInputRef = ref<HTMLInputElement | null>(null);
const zipFileInputRef = ref<HTMLInputElement | null>(null);

const stampFileName = () =>
  new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

const exportDatabase = () => {
  dbExporting.value = true;
  fetchDatabaseBackupPayload()
    .then((payload) => {
      exportJson(
        `jimily-db-backup-${stampFileName()}.json`,
        JSON.stringify(payload, null, 2)
      );
      Alert.success("已生成备份文件并开始下载");
    })
    .catch((e) => Alert.error("导出失败: " + (e?.message || e)))
    .finally(() => (dbExporting.value = false));
};

const openDbImport = () => dbFileInputRef.value?.click();

const onDbFileChange = (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  const restoreConfirmBody = [
    "以下情况请您务必知晓：",
    "",
    "• 当前数据库里「包括您正在使用的管理员账号」在内的全部用户与业务数据都会被删除，再由备份文件中的内容完整替换。",
    "",
    "• 管理员信息将会被覆盖：恢复后生效的是备份里的用户表；若备份来自另一台环境，请使用备份中存在的管理员用户名与密码登录，而不是沿用恢复前的账号。",
    "",
    "• 主题、AI 服务商配置、流水与 Jimi 会话等，一律以备份为准。",
    "",
    "• 恢复成功后，系统将自动退出登录并跳转到登录页，这是正常现象，便于您用备份中的身份重新登录。",
    "",
    "此操作不可撤销。",
  ].join("\n");

  Confirm.open({
    title: "确认从备份恢复数据库？",
    content: restoreConfirmBody,
    confirmText: "我已了解，仍要恢复",
    confirm: async () => {
      dbImporting.value = true;
      try {
        await importDatabaseBackupFile(file);
        Alert.success(
          "数据库已按备份恢复。即将跳转登录页，请使用备份中的管理员账号重新登录。"
        );
        await new Promise((r) => setTimeout(r, 450));
        await logoutAndGoLogin();
      } catch (e) {
        Alert.error(
          "导入失败: " + (e instanceof Error ? e.message : String(e))
        );
      } finally {
        dbImporting.value = false;
      }
    },
    cancel: () => Alert.info("已取消"),
  });
};

const exportInvoicesZip = () => {
  zipExporting.value = true;
  downloadInvoicesZipBlob()
    .then((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `jimily-invoices-${stampFileName()}.zip`;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      Alert.success("小票压缩包已开始下载");
    })
    .catch((e) => Alert.error("导出失败: " + (e?.message || e)))
    .finally(() => (zipExporting.value = false));
};

const openZipImport = () => zipFileInputRef.value?.click();

const onZipFileChange = (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  zipImporting.value = true;
  importInvoicesZipFile(file)
    .then((res) => {
      Alert.success(`已解压写入小票文件 ${res.count} 个`);
    })
    .catch((e) => Alert.error("导入失败: " + (e?.message || e)))
    .finally(() => (zipImporting.value = false));
};
</script>

<template>
  <div class="p-2 md:p-4 space-y-10 max-w-3xl">
    <input ref="dbFileInputRef" type="file" accept="application/json,.json" class="hidden" @change="onDbFileChange" />
    <input ref="zipFileInputRef" type="file" accept=".zip,application/zip" class="hidden" @change="onZipFileChange" />

    <section class="space-y-3">
      <h3 class="text-base font-semibold text-foreground">数据库备份与恢复</h3>
      <div
        class="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground/90 leading-relaxed"
        role="note">若执行「从 JSON
        恢复」，数据库会被备份内容整体替换，
        <span class="font-medium">当前管理员账号也会被备份中的用户表覆盖</span>
        ，恢复后请用备份里对应的管理员账号登录。
      </div>
      <div class="flex flex-wrap gap-3 pt-1">
        <button type="button" :disabled="dbExporting"
          class="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          @click="exportDatabase">
          {{ dbExporting ? "导出中…" : "导出数据库 JSON" }}
        </button>
        <button type="button" :disabled="dbImporting"
          class="px-4 py-2 border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 text-foreground rounded-lg text-sm font-medium transition-colors"
          @click="openDbImport">
          {{ dbImporting ? "导入中…" : "从 JSON 恢复" }}
        </button>
      </div>
    </section>

    <section class="space-y-3 border-t border-border pt-8">
      <h3 class="text-base font-semibold text-foreground">小票文件备份与恢复</h3>
      <p class="text-sm text-muted leading-relaxed">
        根据当前数据库中流水引用的小票文件名，将数据目录下
        <code class="text-xs bg-surface-muted px-1 rounded">images</code>
        中的文件打成 zip 下载；导入时将 zip 内文件解压回该目录（同名覆盖）。请与数据库备份配合使用，以保证流水中的文件名仍能访问到图片。
      </p>
      <div class="flex flex-wrap gap-3 pt-1">
        <button type="button" :disabled="zipExporting"
          class="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
          @click="exportInvoicesZip">
          {{ zipExporting ? "打包中…" : "导出小票 ZIP" }}
        </button>
        <button type="button" :disabled="zipImporting"
          class="px-4 py-2 border border-border bg-surface hover:bg-surface-muted disabled:opacity-50 text-foreground rounded-lg text-sm font-medium transition-colors"
          @click="openZipImport">
          {{ zipImporting ? "导入中…" : "导入小票 ZIP" }}
        </button>
      </div>
    </section>
  </div>
</template>
