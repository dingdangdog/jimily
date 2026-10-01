<script setup lang="ts">
import { getConfig, updateConfig, type SystemConfigRow } from "./api";

const settings = ref<SystemConfigRow>({});
const loading = ref(false);
const saving = ref(false);

const load = () => {
  loading.value = true;
  getConfig()
    .then((res) => (settings.value = res || {}))
    .finally(() => (loading.value = false));
};

const save = () => {
  saving.value = true;
  updateConfig(settings.value)
    .then(() => {
      Alert.success("保存成功");
      load();
    })
    .catch((e) => Alert.error("保存失败: " + (e?.message || e)))
    .finally(() => (saving.value = false));
};

onMounted(() => load());
</script>

<template>
  <div>
    <div v-if="loading" class="flex justify-center items-center py-12">
      <div
        class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"
      ></div>
      <span class="ml-2 text-muted">加载中...</span>
    </div>

    <div v-else class="p-4 md:p-6 max-w-2xl space-y-4">
      <div>
        <label class="block text-sm font-medium text-foreground mb-2">
          站点标题
        </label>
        <input
          v-model="settings.title"
          type="text"
          class="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          placeholder="请输入站点标题"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-foreground mb-2">
          站点描述
        </label>
        <textarea
          v-model="settings.description"
          rows="3"
          class="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none transition-colors"
          placeholder="请输入站点描述"
        ></textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-foreground mb-2">
          SEO 关键词
        </label>
        <textarea
          v-model="settings.keywords"
          rows="2"
          class="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none transition-colors"
          placeholder="关键词，逗号分隔"
        >
        </textarea>
      </div>
      <div>
        <label class="block text-sm font-medium text-foreground mb-2">
          系统版本号
        </label>
        <input
          v-model="settings.version"
          type="text"
          class="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground placeholder-muted focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
          placeholder="如 1.0.0"
        />
      </div>
      <div>
        <label class="block text-sm font-medium text-foreground mb-2">
          是否开放注册
        </label>
        <select
          v-model="settings.openRegister"
          class="w-full px-3 py-2 border border-border rounded-lg bg-surface text-foreground focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-colors"
        >
          <option :value="true">开放</option>
          <option :value="false">不开放</option>
        </select>
      </div>
      <div
        v-if="settings.updateAt"
        class="text-sm text-muted pt-2 border-t border-border"
      >
        最后更新：{{ formatDate(settings.updateAt) }}
      </div>
      <div class="flex justify-end pt-4 border-t border-border">
        <button
          type="button"
          @click="save"
          :disabled="saving"
          class="px-4 py-2 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 text-white rounded-lg transition-colors duration-200 font-medium flex items-center gap-2"
        >
          <span
            v-if="saving"
            class="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full"
          ></span>
          <span>{{ saving ? "保存中..." : "保存设置" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
