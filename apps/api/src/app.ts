import { trpcServer } from '@hono/trpc-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import { auth } from './auth';
import { env } from './env';
import { withMailFailure } from './mail/failures';
import { createContext } from './trpc/init';
import { appRouter } from './trpc/router';

export const app = new Hono();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: env.WEB_ORIGINS,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization', 'x-locale'],
    exposeHeaders: ['set-auth-token'],
  }),
);

app.get('/health', (c) => c.json({ ok: true }));

// Better Auth 1.7 logs and swallows errors thrown from the OTP send callback, so this turns a
// flagged mailer failure into a distinct response instead.
app.on(['GET', 'POST'], '/api/auth/*', (c) => withMailFailure(() => auth.handler(c.req.raw)));

app.use(
  '/trpc/*',
  trpcServer({
    router: appRouter,
    endpoint: '/trpc',
    createContext: (_options, c) => createContext({ req: c.req.raw }),
  }),
);
