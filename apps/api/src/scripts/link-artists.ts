import { eq, isNull, or } from 'drizzle-orm';

import { db } from '../db';
import { migrateDatabase } from '../db/migrate';
import { artist } from '../db/schema';
import { search } from '../search/client';
import { reindexAll } from '../search/documents';
import { enrichArtist, pickDeezerMatch } from '../services/artist-profile';
import { artistSources } from '../services/artist-sources-client';

// Deezer allows 50 requests per 5 s, Wikimedia asks for a gentle pace: one artist at a time.
const PAUSE_MS = 500;

await migrateDatabase();

const rows = await db
  .select()
  .from(artist)
  .where(or(isNull(artist.deezerId), isNull(artist.enrichedAt)));

for (const row of rows) {
  let linked = row.deezerId !== null;
  if (!linked) {
    try {
      const match = pickDeezerMatch(row.name, await artistSources.searchDeezer(row.name));
      const deezer = match && (await artistSources.getDeezerArtist(match.deezerId));
      const taken = deezer && (await db.$count(artist, eq(artist.deezerId, deezer.deezerId))) > 0;
      if (deezer && !taken) {
        await db
          .update(artist)
          .set({
            deezerId: deezer.deezerId,
            pictureUrl: deezer.pictureUrl,
            pictureSmallUrl: deezer.pictureSmallUrl,
          })
          .where(eq(artist.id, row.id));
        linked = true;
      }
    } catch (error) {
      console.error(`Deezer failed for ${row.name}`, error);
    }
  }
  if (row.enrichedAt === null || linked !== (row.deezerId !== null)) {
    await enrichArtist(db, artistSources, row.id);
  }
  console.log(`${linked ? 'linked' : 'no match'}  ${row.name}`);
  await Bun.sleep(PAUSE_MS);
}

const counts = await reindexAll(db, search);
console.log(`Indexed ${counts.artists} artists and ${counts.arrangements} arrangements`);
process.exit(0);
