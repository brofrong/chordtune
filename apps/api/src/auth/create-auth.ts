import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { bearer, emailOTP, username } from 'better-auth/plugins';

import type { Database } from '../db';
import { tables } from '../db/schema';
import type { Mailer } from '../mail';
import { markMailFailed } from '../mail/failures';
import { otpMessage, pickLocale } from '../mail/otp-message';
import type { AuthConfig } from './config';
import { isPlaceholderEmail } from './placeholder-email';
import { isValidUsername, uniqueUsername, usernameBase, usernameHints } from './username';

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
    databaseHooks: {
      user: {
        create: {
          // Every user gets a username at creation; `username` may arrive as a hint (Telegram).
          before: async (data) => ({
            data: {
              ...data,
              username: await uniqueUsername(db, usernameBase(usernameHints(data))),
            },
          }),
        },
      },
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
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        // The name on the site is `user.name`; a second display field would only confuse.
        displayUsername: false,
        usernameValidator: isValidUsername,
      }),
      // Capacitor WebViews run on capacitor:// or https://localhost, where third-party cookies to the
      // API are unreliable, so every build authenticates with a bearer token.
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
