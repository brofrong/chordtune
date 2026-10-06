import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { Database } from '../db';
import { arrangement, artist } from '../db/schema';
import { saveArrangement } from '../services/save-arrangement';
import { createTestDb, createUser } from '../test/db';
import { listItemFromDoc } from '../trpc/routers/shared';
import { type ArrangementDoc, type ArtistDoc, noopSearch, type SearchIndex } from '.';
import { syncArtist } from './documents';

const SMALL = 'https://cdn-images.dzcdn.net/images/artist/abc/250x250-000000-80-0-0.jpg';

let db: Database;
let authorId: string;

beforeEach(async () => {
  db = await createTestDb();
  authorId = await createUser(db, 'author');
});

async function create(title: string) {
  return saveArrangement(db, noopSearch, {
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
}

function recordingSearch() {
  const artists: ArtistDoc[] = [];
  const arrangements: ArrangementDoc[] = [];
  const search: SearchIndex = {
    ...noopSearch,
    upsertArtist: async (doc) => void artists.push(doc),
    upsertArrangement: async (doc) => void arrangements.push(doc),
  };
  return { search, artists, arrangements };
}

describe('syncArtist', () => {
  test('pushes the artist and its published arrangements with the picture', async () => {
    const first = await create('Кукушка');
    await create('Группа крови');
    await db.update(artist).set({ pictureSmallUrl: SMALL });
    const [row] = await db.select().from(artist);

    const { search, artists, arrangements } = recordingSearch();
    await syncArtist(db, search, row?.id ?? '');

    expect(artists).toMatchObject([{ name: 'Кино', songCount: 2, pictureSmallUrl: SMALL }]);
    expect(arrangements).toHaveLength(2);
    expect(arrangements.find((doc) => doc.id === first.id)?.artistPictureSmallUrl).toBe(SMALL);
  });

  test('leaves drafts out', async () => {
    const draft = await create('Кукушка');
    await db.update(artist).set({ pictureSmallUrl: SMALL });
    await db.update(arrangement).set({ status: 'draft' }).where(eq(arrangement.id, draft.id));
    const [row] = await db.select().from(artist);

    const { search, arrangements } = recordingSearch();
    await syncArtist(db, search, row?.id ?? '');
    expect(arrangements).toEqual([]);
  });
});

describe('listItemFromDoc', () => {
  test('a document indexed before pictures existed has no picture rather than undefined', () => {
    const old = {
      id: 'a',
      songId: 's',
      songSlug: 'kukushka',
      artistId: 'r',
      artistSlug: 'kino',
      artist: 'Кино',
      artistTranslit: 'Kino',
      title: 'Кукушка',
      titleTranslit: 'Kukushka',
      lyrics: '',
      chords: [],
      views: 1,
      likes: 0,
      createdAt: 0,
    } as unknown as ArrangementDoc;
    expect(listItemFromDoc(old).artistPictureSmallUrl).toBeNull();
  });
});
