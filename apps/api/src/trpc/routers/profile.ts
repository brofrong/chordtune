import { z } from 'zod';

import { profileArrangements, profileById, profileByUsername } from '../../services/profile';
import { protectedProcedure, publicProcedure, router } from '../init';

export const profileRouter = router({
  me: protectedProcedure.query(({ ctx }) =>
    profileById(ctx.db, ctx.session.user.id, ctx.session.user.id),
  ),
  byUsername: publicProcedure
    .input(z.object({ username: z.string().min(1).max(30) }))
    .query(({ ctx, input }) => profileByUsername(ctx.db, input.username, ctx.session?.user.id)),
  arrangements: publicProcedure
    .input(z.object({ userId: z.string(), cursor: z.string().nullish() }))
    .query(({ ctx, input }) =>
      profileArrangements(ctx.db, { ...input, viewerId: ctx.session?.user.id }),
    ),
});
