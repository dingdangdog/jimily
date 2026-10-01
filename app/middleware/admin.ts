import { buildLoginRedirect } from "~/utils/authRedirect";

export default defineNuxtRouteMiddleware(async (to) => {
  const userStore = useUserStore();
  if (userStore.user && userStore.isAdmin) return;

  if (!userStore.user) {
    const { data: res } = await useFetch<{ c: number; d: any }>(
      "/api/entry/user/info",
      {
        method: "get",
        credentials: "include",
      },
    );
    if (res.value?.c === 200 && res.value.d) {
      userStore.setUser(res.value.d);
    } else {
      return navigateTo(buildLoginRedirect(to.fullPath));
    }
  }

  if (!userStore.isAdmin) {
    return navigateTo({ path: "/" });
  }
  return;
});
