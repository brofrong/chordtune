import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { env } from '../../env';
import { isAdmin } from '../../services/admin';
import { artistPage, deezerCandidates, relinkArtist } from '../../services/artist-profile';
import { WIKI_LANGS } from '../../services/artist-sources';
import { adminProcedure, protectedProcedure, publicProcedure, router } from '../init';
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

  /**
   * Deezer is optional for the editor: when it fails, the user creates the artist by name.
   * Signed in only: Deezer's quota is per server IP, and the API has no rate limiting of its own.
   */
  searchDeezer: protectedProcedure
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

  /** Whether to offer «Change link»: the web page itself is rendered without the user's session. */
  canEdit: publicProcedure.query(({ ctx }) => isAdmin(ctx.session?.user, env.ADMIN_EMAILS)),

  searchWikidata: adminProcedure
    .input(z.object({ q: z.string().max(100) }))
    .query(async ({ ctx, input }) => {
      try {
        return await ctx.artistSources.searchWikidata(input.q);
      } catch (error) {
        console.error('Wikidata search failed', error);
        throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'wikidata-unavailable' });
      }
    }),

  relink: adminProcedure
    .input(
      z.object({
        id: z.string(),
        deezerId: z.number().int().positive().nullable(),
        wikidataId: z
          .string()
          .regex(/^Q\d+$/)
          .nullable(),
      }),
    )
    .mutation(({ ctx, input }) => relinkArtist(ctx.db, ctx.search, ctx.artistSources, input)),
});
