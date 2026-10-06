import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';

import { auth, type Session } from '../auth';
import { db } from '../db';
import { env } from '../env';
import { search } from '../search/client';
import { isAdmin } from '../services/admin';
import { artistSources } from '../services/artist-sources-client';

export async function createContext({ req }: { req: Request }) {
  const session: Session | null = await auth.api.getSession({ headers: req.headers });
  return { db, search, artistSources, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, session: ctx.session } });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!isAdmin(ctx.session.user, env.ADMIN_EMAILS)) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next();
});
