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
    ...(params.ott ? { ott: params.ott } : {}),
  });
  return `${params.origin}/${params.locale}/auth/mobile?${query}`;
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
