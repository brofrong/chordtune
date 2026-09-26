import { z } from 'zod';

import { publicProcedure, router } from '../init';
import { type ArrangementListItem, fromSearch } from './shared';

export const songsRouter = router({
  searchByArtist: publicProcedure
    .input(z.object({ artistId: z.string(), q: z.string().max(200) }))
    .query(({ ctx, input }) => fromSearch(() => ctx.search.searchSongs(input.artistId, input.q))),

  /** Latest published arrangements, straight from Postgres. */
  list: publicProcedure.query(async ({ ctx }): Promise<ArrangementListItem[]> => {
    const rows = await ctx.db.query.arrangement.findMany({
      where: { status: 'published' },
      orderBy: { createdAt: 'desc' },
      limit: 20,
      with: { song: { with: { artist: true } } },
    });
    return rows.map((row) => ({
      id: row.id,
      artist: row.song.artist.name,
      artistSlug: row.song.artist.slug,
      title: row.song.title,
      songSlug: row.song.slug,
      chords: row.chords,
    }));
  }),
});
