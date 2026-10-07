import type { BetterAuthPlugin } from 'better-auth';
import { createAuthMiddleware } from 'better-auth/api';
import { parseSetCookieHeader, setRequestCookie } from 'better-auth/cookies';

/** The `@better-auth/passkey` default name for `advanced.webAuthnChallengeCookie`. */
const CHALLENGE_COOKIE = 'better-auth-passkey';
const HEADER = 'x-passkey-challenge';

const GENERATE_PATHS = new Set([
  '/passkey/generate-register-options',
  '/passkey/generate-authenticate-options',
]);
const VERIFY_PATHS = new Set(['/passkey/verify-registration', '/passkey/verify-authentication']);

/**
 * `@better-auth/passkey` round-trips its WebAuthn challenge through a `SameSite=lax` cookie set
 * by `generate-*-options` and read by `verify-*`. Capacitor WebViews call the API cross-site
 * (`capacitor://localhost` / `https://localhost` → our domain) with bearer auth only — see
 * `bearer()` in create-auth.ts — so that cookie never survives the round trip and native sign-in
 * and add-passkey always fail with `CHALLENGE_NOT_FOUND`. This relays the same signed cookie
 * through a header instead, exactly like `bearer()` relays the session cookie through
 * `set-auth-token`/`Authorization`: copy it out of `Set-Cookie` into a response header after
 * `generate-*-options`, then splice it back into the `Cookie` request header before `verify-*`.
 */
export function passkeyChallengeHeader(): BetterAuthPlugin {
  return {
    id: 'passkey-challenge-header',
    hooks: {
      after: [
        {
          matcher: (context) => GENERATE_PATHS.has(context.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const setCookie = ctx.context.responseHeaders?.get('set-cookie');
            if (!setCookie) {
              return;
            }
            const cookieName = ctx.context.createAuthCookie(CHALLENGE_COOKIE).name;
            const challengeCookie = parseSetCookieHeader(setCookie).get(cookieName);
            if (!challengeCookie?.value) {
              return;
            }
            ctx.setHeader(HEADER, challengeCookie.value);
            // CORS only exposes headers listed here, same as `bearer()` does for its own header.
            const exposed = ctx.context.responseHeaders?.get('access-control-expose-headers') || '';
            const names = new Set(
              exposed
                .split(',')
                .map((name) => name.trim())
                .filter(Boolean),
            );
            names.add(HEADER);
            ctx.setHeader('Access-Control-Expose-Headers', Array.from(names).join(', '));
          }),
        },
      ],
      before: [
        {
          matcher: (context) => VERIFY_PATHS.has(context.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const value = ctx.request?.headers.get(HEADER) ?? ctx.headers?.get(HEADER);
            if (!value) {
              return;
            }
            const existingHeaders = ctx.request?.headers || ctx.headers;
            const headers = new Headers({
              ...Object.fromEntries(existingHeaders?.entries() ?? []),
            });
            const cookieName = ctx.context.createAuthCookie(CHALLENGE_COOKIE).name;
            setRequestCookie(headers, cookieName, value);
            return { context: { headers } };
          }),
        },
      ],
    },
  };
}
