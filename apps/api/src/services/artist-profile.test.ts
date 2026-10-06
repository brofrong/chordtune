import { beforeEach, describe, expect, test } from 'bun:test';

import type { Database } from '../db';
import { artist } from '../db/schema';
import { createTestDb } from '../test/db';
import { enrichArtist } from './artist-profile';
import { type ArtistSources, noArtistSources, type Wiki } from './artist-sources';

const WIKI: Wiki = {
  ru: { title: 'Кино (группа)', description: 'советская рок-группа', extract: '«Кино» — …' },
};

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

async function insertArtist(values: Partial<typeof artist.$inferInsert> = {}) {
  const [row] = await db
    .insert(artist)
    .values({ name: 'Кино', slug: 'kino', ...values })
    .returning();
  if (!row) throw new Error('not inserted');
  return row;
}

describe('enrichArtist', () => {
  test('stores the Wikidata entity and the summaries', async () => {
    const asked: unknown[] = [];
    const sources: ArtistSources = {
      ...noArtistSources,
      findWikidata: async (input) => {
        asked.push(input);
        return 'Q650555';
      },
      getWiki: async () => WIKI,
    };
    const row = await insertArtist({ deezerId: 4505880 });
    await enrichArtist(db, sources, row.id);
    const [after] = await db.select().from(artist);
    expect(asked).toEqual([{ deezerId: 4505880, name: 'Кино' }]);
    expect(after).toMatchObject({ wikidataId: 'Q650555', wiki: WIKI });
    expect(after?.enrichedAt).toBeInstanceOf(Date);
  });

  test('nothing found still counts as asked', async () => {
    const row = await insertArtist();
    await enrichArtist(db, noArtistSources, row.id);
    const [after] = await db.select().from(artist);
    expect(after).toMatchObject({ wikidataId: null, wiki: null });
    expect(after?.enrichedAt).toBeInstanceOf(Date);
  });

  test('a failure leaves the artist to be asked again', async () => {
    const row = await insertArtist();
    const sources: ArtistSources = {
      ...noArtistSources,
      findWikidata: async () => {
        throw new Error('Wikidata is down');
      },
    };
    await enrichArtist(db, sources, row.id);
    const [after] = await db.select().from(artist);
    expect(after?.enrichedAt).toBeNull();
  });
});
