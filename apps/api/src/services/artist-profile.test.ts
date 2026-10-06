import { beforeEach, describe, expect, test } from 'bun:test';
import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';

import type { Database } from '../db';
import { arrangement, artist } from '../db/schema';
import { noopSearch } from '../search';
import { createTestDb, createUser } from '../test/db';
import { artistPage, deezerCandidates, enrichArtist, pickWiki } from './artist-profile';
import { type ArtistSources, noArtistSources, type Wiki } from './artist-sources';
import { saveArrangement } from './save-arrangement';

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

async function addSong(authorId: string, title: string, counts: { views: number; likes: number }) {
  const saved = await saveArrangement(db, noopSearch, {
    authorId,
    input: {
      artist: { name: 'Кино' },
      song: { title },
      content: '${Am}la',
      rhythms: [],
      capo: null,
      tempo: null,
      key: null,
      notes: '',
      tuning: 'standard',
      voicings: {},
      zenMode: null,
    },
  });
  await db
    .update(arrangement)
    .set({ viewCount: counts.views, likeCount: counts.likes })
    .where(eq(arrangement.id, saved.id));
  return saved.id;
}

describe('artistPage', () => {
  test('orders songs by the views of all their published arrangements, then by likes', async () => {
    const author = await createUser(db, 'author');
    await addSong(author, 'Звезда', { views: 5, likes: 0 });
    const latest = await addSong(author, 'Кукушка', { views: 3, likes: 1 });
    await addSong(author, 'Кукушка', { views: 4, likes: 0 });
    await addSong(author, 'Пачка сигарет', { views: 5, likes: 2 });
    // The newest arrangement of «Кукушка» is the one its page shows.
    await db
      .update(arrangement)
      .set({ createdAt: new Date(Date.now() + 60_000) })
      .where(eq(arrangement.id, latest));

    const page = await artistPage(db, 'kino', 'ru');
    expect(page.songCount).toBe(3);
    expect(page.top.map((item) => [item.title, item.views, item.likes])).toEqual([
      ['Кукушка', 7, 1],
      ['Пачка сигарет', 5, 2],
      ['Звезда', 5, 0],
    ]);
    expect(page.top[0]).toMatchObject({
      id: latest,
      artist: 'Кино',
      artistSlug: 'kino',
      songSlug: 'kukushka',
    });
  });

  test('songs with drafts only are left out', async () => {
    const author = await createUser(db, 'author');
    const draft = await addSong(author, 'Звезда', { views: 9, likes: 9 });
    await db.update(arrangement).set({ status: 'draft' }).where(eq(arrangement.id, draft));
    const page = await artistPage(db, 'kino', 'ru');
    expect(page.top).toEqual([]);
    expect(page.songCount).toBe(0);
  });

  test('an unknown slug is NOT_FOUND', async () => {
    const error = await artistPage(db, 'nobody', 'ru').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TRPCError);
    expect((error as TRPCError).code).toBe('NOT_FOUND');
  });
});

describe('pickWiki', () => {
  const en = { title: 'Kino (band)', description: 'Soviet rock band', extract: 'Kino is …' };
  test('the locale first, else the other language, else nothing', () => {
    expect(pickWiki({ ...WIKI, en }, 'en')).toEqual({ lang: 'en', ...en });
    expect(pickWiki(WIKI, 'en')).toEqual({ lang: 'ru', ...WIKI.ru! });
    expect(pickWiki({}, 'ru')).toBeNull();
    expect(pickWiki(null, 'ru')).toBeNull();
  });
});

describe('deezerCandidates', () => {
  const sources: ArtistSources = {
    ...noArtistSources,
    searchDeezer: async () => [
      { deezerId: 4505880, name: 'Кино', pictureSmallUrl: null, fans: 322981 },
      { deezerId: 103841652, name: 'Kino', pictureSmallUrl: null, fans: 31 },
    ],
  };

  test('leaves out Deezer artists we already have', async () => {
    await insertArtist({ deezerId: 4505880 });
    expect((await deezerCandidates(db, sources, 'кино')).map((c) => c.deezerId)).toEqual([
      103841652,
    ]);
  });

  test('keeps them for an admin relinking', async () => {
    await insertArtist({ deezerId: 4505880 });
    expect(await deezerCandidates(db, sources, 'кино', { includeLinked: true })).toHaveLength(2);
  });
});
