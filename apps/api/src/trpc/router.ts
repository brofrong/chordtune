import { sql } from 'drizzle-orm';

import { protectedProcedure, publicProcedure, router } from './init';

export const appRouter = router({
  health: publicProcedure.query(async ({ ctx }) => {
    await ctx.db.execute(sql`select 1`);
    return { ok: true as const, time: new Date() };
  }),
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),
});

export type AppRouter = typeof appRouter;
