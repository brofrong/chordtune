import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

import { placeholderEmail } from './placeholder-email';
import { verifyTelegramLogin } from './telegram';

const body = z.record(z.string(), z.unknown());

function invalid() {
  return new APIError('UNAUTHORIZED', {
    message: 'Invalid Telegram login',
    code: 'INVALID_TELEGRAM_LOGIN',
  });
}

export function telegram({ botToken }: { botToken: string }) {
  return {
    id: 'telegram',
    endpoints: {
      signInTelegram: createAuthEndpoint(
        '/telegram/sign-in',
        { method: 'POST', body },
        async (ctx) => {
          const login = verifyTelegramLogin(ctx.body, botToken);
          if (!login) {
            throw invalid();
          }
          const accountId = String(login.id);
          const existing = await ctx.context.adapter.findOne<{ userId: string }>({
            model: 'account',
            where: [
              { field: 'providerId', value: 'telegram' },
              { field: 'accountId', value: accountId },
            ],
          });
          let user = existing
            ? await ctx.context.internalAdapter.findUserById(existing.userId)
            : null;
          if (!user) {
            const profile = {
              email: placeholderEmail('tg', accountId),
              emailVerified: false,
              name: [login.first_name, login.last_name].filter(Boolean).join(' '),
              image: login.photo_url ?? null,
              // A hint for the username hook (Task 4), not a field the client can set.
              username: login.username,
            };
            const created = await ctx.context.internalAdapter.createOAuthUser(profile, {
              providerId: 'telegram',
              accountId,
            });
            user = created.user;
          }
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ token: session.token, user });
        },
      ),
      linkTelegram: createAuthEndpoint(
        '/telegram/link',
        { method: 'POST', body, use: [sessionMiddleware] },
        async (ctx) => {
          const login = verifyTelegramLogin(ctx.body, botToken);
          if (!login) {
            throw invalid();
          }
          const accountId = String(login.id);
          const userId = ctx.context.session.user.id;
          const existing = await ctx.context.adapter.findOne<{ userId: string }>({
            model: 'account',
            where: [
              { field: 'providerId', value: 'telegram' },
              { field: 'accountId', value: accountId },
            ],
          });
          if (existing && existing.userId !== userId) {
            throw new APIError('BAD_REQUEST', {
              message: 'This Telegram account belongs to another user',
              code: 'TELEGRAM_ALREADY_LINKED',
            });
          }
          if (!existing) {
            await ctx.context.internalAdapter.linkAccount({
              userId,
              providerId: 'telegram',
              accountId,
            });
          }
          return ctx.json({ linked: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
