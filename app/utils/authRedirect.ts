const DEFAULT_AUTH_REDIRECT = "/user/jimi";
const LOGIN_PATH = "/login";

const normalizeCallbackUrl = (value: unknown): string | null => {
  const callbackUrl = Array.isArray(value) ? value[0] : value;
  if (typeof callbackUrl !== "string") return null;

  const trimmed = callbackUrl.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  if (import.meta.client && typeof window !== "undefined") {
    try {
      const url = new URL(trimmed, window.location.origin);
      if (url.origin === window.location.origin) {
        return `${url.pathname}${url.search}${url.hash}`;
      }
    } catch {
      return null;
    }
  }

  return null;
};

export const resolveAuthRedirect = (
  value: unknown,
  fallback = DEFAULT_AUTH_REDIRECT,
): string => {
  const callbackUrl = normalizeCallbackUrl(value);
  if (!callbackUrl) return fallback;
  if (callbackUrl === LOGIN_PATH || callbackUrl.startsWith(`${LOGIN_PATH}?`)) {
    return fallback;
  }
  return callbackUrl;
};

export const buildLoginRedirect = (callbackUrl?: unknown) => {
  const safeCallbackUrl = normalizeCallbackUrl(callbackUrl);
  if (
    !safeCallbackUrl ||
    safeCallbackUrl === LOGIN_PATH ||
    safeCallbackUrl.startsWith(`${LOGIN_PATH}?`)
  ) {
    return { path: LOGIN_PATH };
  }

  return {
    path: LOGIN_PATH,
    query: { callbackUrl: safeCallbackUrl },
  };
};

export { DEFAULT_AUTH_REDIRECT };
