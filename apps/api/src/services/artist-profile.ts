import { eq } from 'drizzle-orm';

import type { Database } from '../db';
import { artist } from '../db/schema';
import type { ArtistSources } from './artist-sources';

/**
 * Finds the artist's Wikidata entity and stores its Wikipedia summaries. Runs after the save that
 * created the artist; a failure is logged and leaves `enrichedAt` empty so a later run retries.
 */
export async function enrichArtist(db: Database, sources: ArtistSources, artistId: string) {
  try {
    const row = await db.query.artist.findFirst({ where: { id: artistId } });
    if (!row) {
      return;
    }
    const wikidataId = await sources.findWikidata({ deezerId: row.deezerId, name: row.name });
    const wiki = wikidataId ? await sources.getWiki(wikidataId) : null;
    await db
      .update(artist)
      .set({ wikidataId, wiki, enrichedAt: new Date() })
      .where(eq(artist.id, artistId));
  } catch (error) {
    console.error(`Enriching artist ${artistId} failed`, error);
  }
}
