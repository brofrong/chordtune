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
const VERIFY_SUFFIXES = ['/passkey/verify-registration', '/passkey/verify-authentication'];

/** The slice of `Auth` that `relayPasskeyChallenge` needs — just enough to compute the cookie name. */
type AuthWithContext = {
  $context: Promise<{ createAuthCookie: (name: string) => { name: string } }>;
};

/**
 * `@better-auth/passkey` round-trips its WebAuthn challenge through a `SameSite=lax` cookie set
 * by `generate-*-options` and read by `verify-*`. Capacitor WebViews call the API cross-site
 * (`capacitor://localhost` / `https://localhost` → our domain) with bearer auth only — see
 * `bearer()` in create-auth.ts — so that cookie never survives the round trip and native sign-in
 * and add-passkey always fail with `CHALLENGE_NOT_FOUND`. This relays the same signed cookie
 * through a header instead, exactly like `bearer()` relays the session cookie through
 * `set-auth-token`/`Authorization`: copy it out of `Set-Cookie` into a response header after
 * `generate-*-options` (this plugin's job), and splice it back into the `Cookie` request header
 * before `verify-*` reaches the handler at all (`relayPasskeyChallenge` below, not a plugin
 * hook — see its own why-comment for why a before-hook cannot do this).
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
    },
  };
}

/**
 * Splices the signed passkey challenge cookie into `request`'s `Cookie` header for
 * `/passkey/verify-*` requests that carry `x-passkey-challenge` — called from `app.ts` on the
 * raw request, before it ever reaches `auth.handler`.
 *
 * This cannot be a plugin before-hook (an earlier revision tried that): Better Auth runs every
 * plugin's before-hook against the one original request and merges whatever headers each hook
 * returns key-by-key, but `bearer()`'s own before-hook unconditionally rebuilds the `cookie`
 * header from scratch — the *original* request's cookie plus the session token — whenever
 * `Authorization: Bearer` is present. Since `bearer()` is registered after this plugin and the
 * Capacitor apps send a bearer token on every call (see `auth-client.ts`), `bearer()`'s rebuilt
 * `cookie` header silently discarded whatever this plugin's before-hook had spliced in, and
 * native `verify-*` calls kept failing with `CHALLENGE_NOT_FOUND` even with the header relayed.
 * Rewriting the request itself, before any hook runs, means every hook — including `bearer()`'s —
 * sees the challenge cookie as if it had always been part of the request.
 */
export async function relayPasskeyChallenge(auth: AuthWithContext, request: Request) {
  const { pathname } = new URL(request.url);
  if (!VERIFY_SUFFIXES.some((suffix) => pathname.endsWith(suffix))) {
    return request;
  }
  const value = request.headers.get(HEADER);
  if (!value) {
    return request;
  }
  const { createAuthCookie } = await auth.$context;
  const cookieName = createAuthCookie(CHALLENGE_COOKIE).name;
  const headers = new Headers(request.headers);
  // `encodeURIComponent`s the value (inside `setRequestCookie`), so a header value containing
  // `;` or `=` can't smuggle in a second cookie.
  setRequestCookie(headers, cookieName, value);
  return new Request(request, { headers });
}
