/**
 * 是否匹配系统深色偏好（prefers-color-scheme: dark），随系统切换更新。
 */
export function usePrefersColorSchemeDark() {
  const prefersDark = ref(false);

  if (import.meta.client) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    prefersDark.value = mq.matches;
    const onChange = (e: MediaQueryListEvent) => {
      prefersDark.value = e.matches;
    };
    mq.addEventListener("change", onChange);
    onBeforeUnmount(() => mq.removeEventListener("change", onChange));
  }

  return prefersDark;
}
