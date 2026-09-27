import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { Database } from '../../db';
import { arrangementInput, saveArrangement } from '../../services/save-arrangement';
import { addPlays, recordView, setLike, setSave } from '../../services/social';
import { protectedProcedure, publicProcedure, router } from '../init';

const byId = z.object({ id: z.string() });

const WITH_DETAILS = {
  song: { with: { artist: true } },
  author: { columns: { id: true, name: true } },
} as const;

async function findArrangement(db: Database, id: string) {
  return db.query.arrangement.findFirst({ where: { id }, with: WITH_DETAILS });
}

type ArrangementRow = NonNullable<Awaited<ReturnType<typeof findArrangement>>>;

/** Drafts are visible to their author only. */
function toView(row: ArrangementRow | undefined, viewerId: string | undefined) {
  if (!row || (row.status === 'draft' && row.authorId !== viewerId)) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  const { song, author, songId: _songId, authorId: _authorId, ...rest } = row;
  const { artist, artistId: _artistId, ...songFields } = song;
  return { ...rest, author, song: songFields, artist };
}

export const arrangementsRouter = router({
  byId: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) =>
      toView(await findArrangement(ctx.db, input.id), ctx.session?.user.id),
    ),

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
      return toView(row, ctx.session?.user.id);
    }),

  create: protectedProcedure
    .input(arrangementInput)
    .mutation(({ ctx, input }) =>
      saveArrangement(ctx.db, ctx.search, { authorId: ctx.session.user.id, input }),
    ),

  update: protectedProcedure
    .input(arrangementInput.extend({ id: z.string() }))
    .mutation(({ ctx, input: { id, ...input } }) =>
      saveArrangement(ctx.db, ctx.search, {
        authorId: ctx.session.user.id,
        arrangementId: id,
        input,
      }),
    ),

  /** Anonymous viewers are counted by a device key, signed-in ones by their user id. */
  view: publicProcedure
    .input(z.object({ id: z.string(), viewerKey: z.string().min(8).max(64) }))
    .mutation(({ ctx, input }) =>
      recordView(ctx.db, input.id, ctx.session?.user.id ?? `device:${input.viewerKey}`),
    ),

  like: protectedProcedure
    .input(byId)
    .mutation(({ ctx, input }) => setLike(ctx.db, ctx.session.user.id, input.id, true)),
  unlike: protectedProcedure
    .input(byId)
    .mutation(({ ctx, input }) => setLike(ctx.db, ctx.session.user.id, input.id, false)),
  save: protectedProcedure
    .input(byId)
    .mutation(({ ctx, input }) => setSave(ctx.db, ctx.session.user.id, input.id, true)),
  unsave: protectedProcedure
    .input(byId)
    .mutation(({ ctx, input }) => setSave(ctx.db, ctx.session.user.id, input.id, false)),

  /** `times` > 1 comes from plays queued while offline. */
  played: protectedProcedure
    .input(z.object({ id: z.string(), times: z.number().int().min(1).max(50).default(1) }))
    .mutation(({ ctx, input }) => addPlays(ctx.db, ctx.session.user.id, input.id, input.times)),
});
