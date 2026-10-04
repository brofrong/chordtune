/** Where the API listens next to the web server: in the container and in `bun run dev`. */
export const INTERNAL_API_URL = 'http://localhost:4000';

/**
 * The web build reaches the API through its own origin (Next rewrites `/trpc` and `/api/auth`),
 * so the same build works on any domain. The Capacitor build has no server to proxy through and
 * calls the public API directly.
 */
export function resolveApiUrl({
  target,
  browserOrigin,
  publicApiUrl,
}: {
  target: 'web' | 'capacitor';
  browserOrigin: string | null;
  publicApiUrl: string | undefined;
}): string {
  if (target === 'capacitor') {
    // Without an absolute http(s) address the WebView would resolve API calls against itself.
    if (!publicApiUrl || !/^https?:\/\/[^/\s]+/.test(publicApiUrl)) {
      throw new Error(
        `NEXT_PUBLIC_API_URL must be an http(s) address for the Capacitor build, got "${publicApiUrl ?? ''}"`,
      );
    }
    return publicApiUrl.replace(/\/+$/, '');
  }
  return browserOrigin ?? INTERNAL_API_URL;
}

export const API_URL = resolveApiUrl({
  target: process.env.NEXT_PUBLIC_BUILD_TARGET === 'capacitor' ? 'capacitor' : 'web',
  browserOrigin: typeof window === 'undefined' ? null : window.location.origin,
  publicApiUrl: process.env.NEXT_PUBLIC_API_URL,
});

const TOKEN_KEY = 'chordtune.auth-token';

/**
 * Session token from the Better Auth bearer plugin. Cookies to a separate API origin are not
 * reliable inside Capacitor WebViews, so every build sends the token explicitly.
 */
export const authToken = {
  get(): string | null {
    try {
      return typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) {
        localStorage.setItem(TOKEN_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_KEY);
      }
    } catch {
      // storage can be unavailable in private mode
    }
  },
};
