export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
