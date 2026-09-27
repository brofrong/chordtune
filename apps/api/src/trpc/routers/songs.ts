import { z } from 'zod';
import { toListItem } from '../../services/arrangements';
import { publicProcedure, router } from '../init';
import { fromSearch } from './shared';

export const songsRouter = router({
  searchByArtist: publicProcedure
    .input(z.object({ artistId: z.string(), q: z.string().max(200) }))
    .query(({ ctx, input }) => fromSearch(() => ctx.search.searchSongs(input.artistId, input.q))),

  /** Popular published arrangements, straight from Postgres. */
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.query.arrangement.findMany({
      where: { status: 'published' },
      orderBy: { viewCount: 'desc', createdAt: 'desc' },
      limit: 20,
      with: { song: { with: { artist: true } } },
    });
    return rows.map(toListItem);
  }),
});
