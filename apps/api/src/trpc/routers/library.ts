import { likedArrangements, myArrangements, savedArrangements } from '../../services/arrangements';
import { protectedProcedure, router } from '../init';

/** The «Моё» tab: saved (full, for offline), liked and own arrangements. */
export const libraryRouter = router({
  saved: protectedProcedure.query(({ ctx }) => savedArrangements(ctx.db, ctx.session.user.id)),
  liked: protectedProcedure.query(({ ctx }) => likedArrangements(ctx.db, ctx.session.user.id)),
  mine: protectedProcedure.query(({ ctx }) => myArrangements(ctx.db, ctx.session.user.id)),
});
