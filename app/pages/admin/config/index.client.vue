<script setup lang="ts">
definePageMeta({
  layout: "public",
  middleware: ["admin"],
});

import SystemInfoSettingsTab from "./SystemInfoSettingsTab.vue";
import BackupRestoreTab from "./BackupRestoreTab.vue";

type ConfigTab = "info" | "backup";
const activeTab = ref<ConfigTab>("info");

const tabs: { id: ConfigTab; label: string; hint: string }[] = [
  { id: "info", label: "系统信息配置", hint: "站点标题、描述、注册开关等" },
  { id: "backup", label: "数据备份与恢复", hint: "数据库 JSON 与小票 ZIP" },
];
</script>

<template>
  <div class="p-2 md:p-4 bg-surface-muted min-h-full">
    <div class="bg-surface rounded-lg shadow-sm border border-border overflow-hidden">

      <div class="flex flex-wrap gap-1 px-2 pt-2 border-b border-border bg-surface-muted/30" role="tablist">
        <button v-for="t in tabs" :key="t.id" type="button" role="tab" :aria-selected="activeTab === t.id"
          class="px-3 py-2 text-sm font-medium rounded-t-md transition-colors" :class="activeTab === t.id
            ? 'bg-surface text-primary-600 border border-b-0 border-border -mb-px z-[1]'
            : 'text-muted hover:text-foreground'
            " @click="activeTab = t.id">
          {{ t.label }}
        </button>
      </div>

      <div class="min-h-[320px]">
        <SystemInfoSettingsTab v-show="activeTab === 'info'" />
        <BackupRestoreTab v-show="activeTab === 'backup'" />
      </div>
    </div>
  </div>
</template>
