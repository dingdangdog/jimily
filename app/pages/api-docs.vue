<script setup lang="ts">
import { defineAsyncComponent } from "vue";
import "@scalar/api-reference/style.css";

const ApiReference = defineAsyncComponent(() =>
  import("@scalar/api-reference").then((m) => m.ApiReference),
);

definePageMeta({
  layout: false,
});

const prefersDark = usePrefersColorSchemeDark();

const configuration = computed(() => ({
  url: "/api/openapi.json",
  darkMode: prefersDark.value,
}));
</script>

<template>
  <div class="flex h-[100dvh] flex-col overflow-hidden bg-surface text-foreground">
    <Suspense>
      <!-- 随系统明暗变化 remount，避免 Scalar 内部未同步 darkMode -->
      <ApiReference :key="String(prefersDark)" class="h-full overflow-y-auto" :configuration="configuration" />
      <template #fallback>
        <div class="flex h-full overflow-y-auto items-center justify-center p-8 text-muted">
          正在加载 API 文档…
        </div>
      </template>
    </Suspense>
  </div>
</template>
