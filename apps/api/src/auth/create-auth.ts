import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, dispatchAuthEndpoint, getSession } from 'better-auth/api';
import { bearer, emailOTP, genericOAuth, oneTimeToken, username } from 'better-auth/plugins';

import type { Database } from '../db';
import { tables } from '../db/schema';
import type { Mailer } from '../mail';
import { markMailFailed } from '../mail/failures';
import { otpMessage, pickLocale } from '../mail/otp-message';
import type { AuthConfig } from './config';
import { isRecentSignIn, REAUTH_REQUIRED } from './delete-account';
import { passkeyChallengeHeader } from './passkey-challenge-header';
import { isPlaceholderEmail } from './placeholder-email';
import { genericProviders, socialProviders, TRUSTED_PROVIDERS } from './providers';
import { LAST_SIGN_IN_METHOD, signInMethodCount } from './sign-in-methods';
import { telegram } from './telegram-plugin';
import { isValidUsername, usernameGenerator } from './username';

export type AuthDeps = {
  db: Database;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  config: AuthConfig;
  mailer: Mailer;
  /** Only ever overridden in tests, to silence Better Auth's "background task failed" log. */
  logger?: { disabled?: boolean };
};

export const MAIL_FAILED = 'MAIL_FAILED';

export function createAuth({
  db,
  secret,
  baseURL,
  trustedOrigins,
  config,
  mailer,
  logger,
}: AuthDeps) {
  const isReviewEmail = (email: string) => email === config.review?.email;

  return betterAuth({
    baseURL,
    secret,
    logger,
    database: drizzleAdapter(db, { provider: 'pg', schema: tables }),
    trustedOrigins,
    socialProviders: socialProviders(config),
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: [...TRUSTED_PROVIDERS],
        // Linking from the profile is done while signed in, so a different email there is fine —
        // Telegram and VK accounts often have none.
        allowDifferentEmails: true,
        // We guard the last sign-in method ourselves (Task 7): Better Auth counts only provider
        // accounts and would refuse to unlink a provider from a user who also signs in by email.
        allowUnlinkingAll: true,
      },
    },
    user: {
      deleteUser: { enabled: true },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        // `getSessionFromCtx` calls `getSession()` as a plain function, which skips the
        // before-hook pipeline — so it never sees the `bearer` plugin's header→cookie
        // translation and returns no session for bearer-authenticated callers. Re-enter the
        // pipeline with `dispatchAuthEndpoint` instead, as its own doc comment recommends.
        // `getSession()`'s own handler resolves to `null` (doesn't throw) when there's simply no
        // session — that's the only "no session" case we treat as such. Anything it throws
        // (a real failure, not "unauthenticated") must propagate and block the action: this is a
        // security guard, so a transient error here has to fail closed, not be read as "no
        // session, go ahead".
        const getCurrentSession = (c: typeof ctx) =>
          dispatchAuthEndpoint(getSession(), {
            headers: c.headers,
            context: c.context,
            method: 'GET',
            asResponse: false,
          }) as Promise<{ session: { createdAt: Date }; user: { id: string } } | null>;

        // Deleting the account relies on this same re-entry: `deleteUser`'s own
        // `beforeDelete(user, request)` only gets a `request` when the call arrives over HTTP,
        // not from a direct `auth.api.deleteUser({ headers })` (bearer, like the mobile app, or
        // our own tests) — so the freshness check lives here instead.
        if (ctx.path === '/delete-user') {
          const current = await getCurrentSession(ctx);
          if (!current || !isRecentSignIn(current.session.createdAt)) {
            throw new APIError('FORBIDDEN', { message: 'Sign in again', code: REAUTH_REQUIRED });
          }
          return;
        }
        if (ctx.path !== '/unlink-account' && ctx.path !== '/passkey/delete-passkey') {
          return;
        }
        const session = await getCurrentSession(ctx);
        if (session && (await signInMethodCount(db, session.user.id)) <= 1) {
          throw new APIError('BAD_REQUEST', {
            message: 'This is the last way to sign in',
            code: LAST_SIGN_IN_METHOD,
          });
        }
      }),
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        changeEmail: { enabled: true },
        // Store reviewers cannot read our mail, so their address always takes the configured code.
        generateOTP: ({ email }) => (isReviewEmail(email) ? config.review?.code : undefined),
        async sendVerificationOTP({ email, otp, type }, ctx) {
          if (isPlaceholderEmail(email) || isReviewEmail(email)) {
            return;
          }
          const locale = pickLocale(ctx?.request?.headers.get('x-locale'));
          const message = otpMessage(
            locale,
            otp,
            type === 'change-email' ? 'change-email' : 'sign-in',
          );
          try {
            await mailer({ to: email, ...message });
          } catch (error) {
            console.error('[mail] sending the code failed', error);
            // Better Auth swallows a throw here (see mail/failures.ts), so mark the failure
            // on the request's store; outside that store (e.g. a direct auth.api call),
            // throwing is the only way to signal it.
            if (!markMailFailed()) {
              throw new APIError('SERVICE_UNAVAILABLE', {
                message: 'Mail failed',
                code: MAIL_FAILED,
              });
            }
          }
        },
      }),
      // Must come before `username(...)`: its own `create.before` hook needs to see an already
      // clean, unique username, not a raw hint (see the why-comment on `usernameGenerator`).
      usernameGenerator(db),
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        // The name on the site is `user.name`; a second display field would only confuse.
        displayUsername: false,
        usernameValidator: isValidUsername,
      }),
      ...(config.yandex ? [genericOAuth({ config: genericProviders(config) })] : []),
      ...(config.telegram ? [telegram({ botToken: config.telegram.botToken })] : []),
      // The system browser signs in on the web and hands the app a one-time token by deep link.
      oneTimeToken({ expiresIn: 3 }),
      passkey({ rpID: config.passkey.rpID, rpName: 'ChordTune', origin: config.passkey.origins }),
      // The passkey plugin's own challenge cookie doesn't survive the Capacitor apps' cross-site
      // calls any better than a session cookie would (see its own why-comment); relay it the same
      // way `bearer()` below relays the session.
      passkeyChallengeHeader(),
      // Capacitor WebViews run on capacitor:// or https://localhost, where third-party cookies to the
      // API are unreliable, so every build authenticates with a bearer token.
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
