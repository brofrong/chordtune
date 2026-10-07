import type { ProviderId } from '@chordtune/api';

export const DEEP_LINK_PREFIX = 'app.chordtune://auth';
export const PENDING_TTL_MS = 10 * 60_000;
const PENDING_KEY = 'chordtune.pending-auth';

export type PendingAuth = {
  state: string;
  mode: 'sign-in' | 'link';
  provider: ProviderId;
  createdAt: number;
};

export function createPendingAuth(
  mode: PendingAuth['mode'],
  provider: ProviderId,
  now = Date.now(),
): PendingAuth {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const state = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return { state, mode, provider, createdAt: now };
}

export function parseAuthLink(url: string) {
  if (!url.startsWith(DEEP_LINK_PREFIX)) {
    return null;
  }
  const query = url.slice(DEEP_LINK_PREFIX.length).replace(/^\/?\?/, '');
  const params = new URLSearchParams(query);
  const state = params.get('state');
  if (!state) {
    return null;
  }
  return {
    state,
    token: params.get('token'),
    linked: params.get('linked'),
    error: params.get('error'),
  };
}

/** A link only counts if the app started this flow recently; anything else could be injected. */
export function matchPendingAuth(
  pending: PendingAuth | null,
  link: { state: string },
  now = Date.now(),
) {
  return Boolean(
    pending && pending.state === link.state && now - pending.createdAt <= PENDING_TTL_MS,
  );
}

export function mobileStartUrl(params: {
  origin: string;
  locale: string;
  provider: ProviderId;
  state: string;
  mode: 'sign-in' | 'link';
  ott?: string;
}) {
  const query = new URLSearchParams({
    provider: params.provider,
    state: params.state,
    mode: params.mode,
  });
  // The fragment never reaches the server (access logs, proxies), unlike the query string.
  const hash = params.ott ? `#ott=${encodeURIComponent(params.ott)}` : '';
  return `${params.origin}/${params.locale}/auth/mobile?${query}${hash}`;
}

/** localStorage, not sessionStorage: Android may kill the app while the browser is open. */
export const pendingAuthStore = {
  get(): PendingAuth | null {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? (JSON.parse(raw) as PendingAuth) : null;
    } catch {
      return null;
    }
  },
  set(value: PendingAuth | null) {
    try {
      if (value) {
        localStorage.setItem(PENDING_KEY, JSON.stringify(value));
      } else {
        localStorage.removeItem(PENDING_KEY);
      }
    } catch {
      // storage can be unavailable
    }
  },
};

export type BrowserFlow = { state: string; mode: 'sign-in' | 'link'; provider: ProviderId };
const BROWSER_FLOW_KEY = 'chordtune.mobile-auth';

/**
 * Ties `/auth/mobile/done` back to the `/auth/mobile` request that started it, in this same
 * browser tab. Without this, anyone who can get a signed-in browser to open
 * `/auth/mobile/done?...` (e.g. a Custom Tab sharing Chrome's cookies) could mint a session or
 * fake a `linked` result without ever having gone through the provider.
 */
export function matchBrowserFlow(saved: BrowserFlow | null, flow: BrowserFlow): boolean {
  return Boolean(
    saved &&
      saved.state === flow.state &&
      saved.mode === flow.mode &&
      saved.provider === flow.provider,
  );
}

/** sessionStorage: this only needs to survive the redirect round trip in the same tab. */
export const browserFlowStore = {
  get(): BrowserFlow | null {
    try {
      const raw = sessionStorage.getItem(BROWSER_FLOW_KEY);
      return raw ? (JSON.parse(raw) as BrowserFlow) : null;
    } catch {
      return null;
    }
  },
  set(value: BrowserFlow | null) {
    try {
      if (value) {
        sessionStorage.setItem(BROWSER_FLOW_KEY, JSON.stringify(value));
      } else {
        sessionStorage.removeItem(BROWSER_FLOW_KEY);
      }
    } catch {
      // storage can be unavailable
    }
  },
};

/**
 * Telegram's redirect callback appends `#tgAuthResult=<base64url>` (or `=false` when the user
 * cancels) to `return_to`. `atob` alone mangles non-ASCII names (it reads Latin-1, not UTF-8), so
 * we go through bytes and `TextDecoder`. Returns `null` when the fragment is missing or unusable.
 */
export function decodeTgAuthResult(hash: string): Record<string, unknown> | null | false {
  const match = hash.match(/tgAuthResult=([^&]*)/);
  if (!match) {
    return null;
  }
  const raw = match[1] ?? '';
  if (raw === 'false') {
    return false;
  }
  try {
    const base64 = raw.replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
