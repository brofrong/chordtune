import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { artistPage, deezerCandidates } from '../../services/artist-profile';
import { WIKI_LANGS } from '../../services/artist-sources';
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

  /** Deezer is optional for the editor: when it fails, the user creates the artist by name. */
  searchDeezer: publicProcedure
    .input(z.object({ q: z.string().max(100), includeLinked: z.boolean().default(false) }))
    .query(async ({ ctx, input }) => {
      try {
        return await deezerCandidates(ctx.db, ctx.artistSources, input.q, input);
      } catch (error) {
        console.error('Deezer search failed', error);
        throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'deezer-unavailable' });
      }
    }),

  bySlug: publicProcedure
    .input(z.object({ slug: z.string().max(200), locale: z.enum(WIKI_LANGS) }))
    .query(({ ctx, input }) => artistPage(ctx.db, input.slug, input.locale)),
});
