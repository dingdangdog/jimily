<script setup lang="ts">
import { ref, watch } from "vue";
import { add, update } from "./api";
import { editInfoFlag } from "./flag";

const props = defineProps<{ item: User | Record<string, unknown>; title: string }>();
const emits = defineEmits(["success", "cancel"]);
const editItem = ref<User | Record<string, unknown>>({});

watch(
  () => props.item,
  (v) => {
    editItem.value = v ? { ...v } : {};
  },
  { immediate: true }
);

const errors = ref({ username: "", password: "", name: "", email: "" });

const validateForm = () => {
  errors.value = { username: "", password: "", name: "", email: "" };
  let isValid = true;
  if (!String(editItem.value?.username ?? "").trim()) {
    errors.value.username = "账号不能为空";
    isValid = false;
  } else if (String(editItem.value.username).length < 4) {
    errors.value.username = "账号至少 4 个字符";
    isValid = false;
  }
  const isCreate = !editItem.value?.id;
  if (isCreate) {
    if (!String(editItem.value?.password ?? "").trim()) {
      errors.value.password = "密码不能为空";
      isValid = false;
    } else if (String(editItem.value.password).length < 8) {
      errors.value.password = "密码至少 8 个字符";
      isValid = false;
    }
  }
  return isValid;
};

const loading = ref(false);

const save = () => {
  if (!validateForm()) return;
  loading.value = true;
  if (editItem.value?.id) {
    update({
      id: editItem.value.id as number,
      name: editItem.value.name as string,
      email: editItem.value.email as string | undefined,
      roles: editItem.value.roles as string | undefined,
    })
      .then(() => {
        Alert.success("修改成功");
        editInfoFlag.value = false;
        emits("success");
      })
      .catch((err: Error) => Alert.error("修改失败: " + err.message))
      .finally(() => (loading.value = false));
  } else {
    add({
      username: String(editItem.value?.username ?? "").trim(),
      password: String(editItem.value?.password ?? ""),
      name: editItem.value?.name as string | undefined,
      email: editItem.value?.email as string | undefined,
      roles: editItem.value?.roles as string | undefined,
    })
      .then(() => {
        Alert.success("添加成功");
        editInfoFlag.value = false;
        emits("success");
      })
      .catch((err: Error) => Alert.error("添加失败: " + err.message))
      .finally(() => (loading.value = false));
  }
};

const close = () => {
  editInfoFlag.value = false;
  emits("cancel");
};
</script>

<template>
  <div
    v-if="editInfoFlag"
    class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
    @click="close"
  >
    <div
      class="bg-surface text-foreground rounded-lg shadow-xl w-full max-w-md border border-border transform transition-all"
      @click.stop
    >
      <div class="px-6 py-4 border-b border-border flex justify-between items-center">
        <h3 class="text-lg font-semibold">{{ title }}</h3>
        <button
          type="button"
          @click="close"
          class="text-foreground/40 hover:text-foreground/70 transition-colors"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
          </svg>
        </button>
      </div>

      <div class="px-6 py-4 space-y-4">
        <div>
          <label class="block text-sm font-medium text-foreground/70 mb-2">昵称</label>
          <input
            v-model="editItem.name"
            type="text"
            class="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="请输入昵称"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground/70 mb-2"
            >账号 <span class="text-red-500">*</span></label
          >
          <input
            v-model="editItem.username"
            type="text"
            :readonly="!!editItem.id"
            :class="[
              'w-full px-3 py-2 border rounded-lg text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 transition-colors',
              errors.username ? 'bg-red-900/20 border-red-500' : 'bg-background border-border focus:ring-primary-500',
            ]"
            placeholder="请输入账号"
          />
          <p v-if="errors.username" class="mt-1 text-sm text-red-500">{{ errors.username }}</p>
        </div>

        <div v-if="!editItem.id">
          <label class="block text-sm font-medium text-foreground/70 mb-2"
            >密码 <span class="text-red-500">*</span></label
          >
          <input
            v-model="editItem.password"
            type="password"
            :class="[
              'w-full px-3 py-2 border rounded-lg text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 transition-colors',
              errors.password ? 'bg-red-900/20 border-red-500' : 'bg-background border-border focus:ring-primary-500',
            ]"
            placeholder="至少 8 个字符"
          />
          <p v-if="errors.password" class="mt-1 text-sm text-red-500">{{ errors.password }}</p>
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground/70 mb-2">Email</label>
          <input
            v-model="editItem.email"
            type="email"
            class="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="选填"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-foreground/70 mb-2">角色</label>
          <input
            v-model="editItem.roles"
            type="text"
            class="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="如 admin,user 逗号分隔"
          />
        </div>
      </div>

      <div class="px-6 py-4 border-t border-border flex justify-end space-x-3 bg-surface-muted">
        <button
          type="button"
          @click="close"
          :disabled="loading"
          class="px-4 py-2 bg-surface hover:bg-surface-muted disabled:opacity-70 text-foreground/80 rounded-lg border border-border"
        >
          取消
        </button>
        <button
          type="button"
          @click="save"
          :disabled="loading"
          class="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-70 text-white rounded-lg flex items-center gap-2"
        >
          <svg v-if="loading" class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>{{ loading ? "保存中..." : "保存" }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
