import { sql } from 'drizzle-orm';

import { protectedProcedure, publicProcedure, router } from './init';
import { arrangementsRouter } from './routers/arrangements';
import { artistsRouter } from './routers/artists';
import { authRouter } from './routers/auth';
import { libraryRouter } from './routers/library';
import { profileRouter } from './routers/profile';
import { searchRouter } from './routers/search';
import { songsRouter } from './routers/songs';

export const appRouter = router({
  health: publicProcedure.query(async ({ ctx }) => {
    await ctx.db.execute(sql`select 1`);
    return { ok: true as const, time: new Date() };
  }),
  me: protectedProcedure.query(({ ctx }) => ctx.session.user),
  auth: authRouter,
  artists: artistsRouter,
  songs: songsRouter,
  search: searchRouter,
  arrangements: arrangementsRouter,
  library: libraryRouter,
  profile: profileRouter,
});

export type AppRouter = typeof appRouter;
