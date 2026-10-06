import { z } from 'zod';

import { syncArrangement } from '../../search/documents';
import { createThrottle } from '../../search/throttle';
import { findView, toView, WITH_DETAILS } from '../../services/arrangements';
import { enrichArtist } from '../../services/artist-profile';
import { arrangementInput, saveArrangement } from '../../services/save-arrangement';
import { addPlays, recordView, setLike, setSave } from '../../services/social';
import { type Context, protectedProcedure, publicProcedure, router } from '../init';

const byId = z.object({ id: z.string() });

const searchSync = createThrottle(30_000);

/** Likes and saves change search ranking fields; re-index at most every 30 s per song. */
function scheduleSearchSync(ctx: Pick<Context, 'db' | 'search'>, id: string) {
  searchSync(id, () => void syncArrangement(ctx.db, ctx.search, id));
}

/** A new artist gets its Wikipedia summary in the background; the author does not wait for it. */
function afterSave(
  ctx: Pick<Context, 'db' | 'artistSources'>,
  saved: Awaited<ReturnType<typeof saveArrangement>>,
) {
  if (!saved.artistEnriched) {
    void enrichArtist(ctx.db, ctx.artistSources, saved.artistId);
  }
  return { id: saved.id, artistSlug: saved.artistSlug, songSlug: saved.songSlug };
}

async function withSync<T>(ctx: Pick<Context, 'db' | 'search'>, id: string, action: Promise<T>) {
  const result = await action;
  scheduleSearchSync(ctx, id);
  return result;
}

export const arrangementsRouter = router({
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ ctx, input }) => findView(ctx.db, input.id, ctx.session?.user.id)),

  /** The latest published arrangement of a song, for `/songs/[artist]/[song]`. */
  bySlug: publicProcedure
    .input(z.object({ artistSlug: z.string(), songSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const artist = await ctx.db.query.artist.findFirst({ where: { slug: input.artistSlug } });
      const song = artist
        ? await ctx.db.query.song.findFirst({
            where: { artistId: artist.id, slug: input.songSlug },
          })
        : undefined;
      const row = song
        ? await ctx.db.query.arrangement.findFirst({
            where: { songId: song.id, status: 'published' },
            orderBy: { createdAt: 'desc' },
            with: WITH_DETAILS,
          })
        : undefined;
      return toView(ctx.db, row, ctx.session?.user.id);
    }),

  create: protectedProcedure
    .input(arrangementInput)
    .mutation(async ({ ctx, input }) =>
      afterSave(
        ctx,
        await saveArrangement(
          ctx.db,
          ctx.search,
          { authorId: ctx.session.user.id, input },
          ctx.artistSources,
        ),
      ),
    ),

  update: protectedProcedure
    .input(arrangementInput.extend({ id: z.string() }))
    .mutation(async ({ ctx, input: { id, ...input } }) =>
      afterSave(
        ctx,
        await saveArrangement(
          ctx.db,
          ctx.search,
          { authorId: ctx.session.user.id, arrangementId: id, input },
          ctx.artistSources,
        ),
      ),
    ),

  /** Anonymous viewers are counted by a device key, signed-in ones by their user id. */
  view: publicProcedure
    .input(z.object({ id: z.string(), viewerKey: z.string().min(8).max(64) }))
    .mutation(({ ctx, input }) =>
      recordView(ctx.db, input.id, ctx.session?.user.id ?? `device:${input.viewerKey}`),
    ),

  like: protectedProcedure
    .input(byId)
    .mutation(({ ctx, input }) =>
      withSync(ctx, input.id, setLike(ctx.db, ctx.session.user.id, input.id, true)),
    ),
  unlike: protectedProcedure
    .input(byId)
    .mutation(({ ctx, input }) =>
      withSync(ctx, input.id, setLike(ctx.db, ctx.session.user.id, input.id, false)),
    ),
  save: protectedProcedure
    .input(byId)
    .mutation(({ ctx, input }) =>
      withSync(ctx, input.id, setSave(ctx.db, ctx.session.user.id, input.id, true)),
    ),
  unsave: protectedProcedure
    .input(byId)
    .mutation(({ ctx, input }) =>
      withSync(ctx, input.id, setSave(ctx.db, ctx.session.user.id, input.id, false)),
    ),

  /** `times` > 1 comes from plays queued while offline. */
  played: protectedProcedure
    .input(z.object({ id: z.string(), times: z.number().int().min(1).max(50).default(1) }))
    .mutation(({ ctx, input }) => addPlays(ctx.db, ctx.session.user.id, input.id, input.times)),
});
