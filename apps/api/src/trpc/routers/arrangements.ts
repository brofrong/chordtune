import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import type { Database } from '../../db';
import { arrangementInput, saveArrangement } from '../../services/save-arrangement';
import { protectedProcedure, publicProcedure, router } from '../init';

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
});
