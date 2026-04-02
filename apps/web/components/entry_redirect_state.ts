const pendingRedirectKeys = ['returnTo', 'next', 'redirect', 'callbackUrl', 'pendingRedirect'] as const;

export function clearPendingEntryRedirectState() {
  if (typeof window === 'undefined') {
    return;
  }

  for (const key of pendingRedirectKeys) {
    try {
      window.sessionStorage.removeItem(key);
    } catch {}

    try {
      window.localStorage.removeItem(key);
    } catch {}
  }
}
