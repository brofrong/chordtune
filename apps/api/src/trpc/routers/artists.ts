import { z } from 'zod';

import { publicProcedure, router } from '../init';
import { fromSearch } from './shared';

export const artistsRouter = router({
  search: publicProcedure
    .input(z.object({ q: z.string().max(100) }))
    .query(async ({ ctx, input }) => {
      const hits = await fromSearch(() => ctx.search.searchArtists(input.q));
      return hits.map(({ id, name, slug, songCount, pictureSmallUrl }) => ({
        id,
        name,
        slug,
        songCount,
        pictureSmallUrl: pictureSmallUrl ?? null,
      }));
    }),
});
