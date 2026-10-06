import { beforeEach, describe, expect, test } from 'bun:test';

import type { Database } from '../db';
import { noopSearch } from '../search';
import { createTestDb, createUser } from '../test/db';
import { findView, likedArrangements, myArrangements, savedArrangements } from './arrangements';
import { saveArrangement } from './save-arrangement';
import { addPlays, recordView, setLike, setSave } from './social';

let db: Database;
let alice: string;
let bob: string;

async function create(authorId: string, title: string) {
  const saved = await saveArrangement(db, noopSearch, {
    authorId,
    input: {
      artist: { name: 'LUMEN' },
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
  return saved.id;
}

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice');
  bob = await createUser(db, 'bob');
});

describe('findView', () => {
  test('includes stats and the viewer state', async () => {
    const id = await create(alice, 'Гореть');
    await recordView(db, id, 'device:x');
    await setLike(db, bob, id, true);
    await setSave(db, bob, id, true);
    await addPlays(db, bob, id, 2);

    const asBob = await findView(db, id, bob);
    expect(asBob.stats).toEqual({ views: 1, likes: 1, saves: 1 });
    expect(asBob.me).toEqual({ liked: true, saved: true, played: 2 });
    expect(asBob).toMatchObject({ song: { title: 'Гореть' }, artist: { name: 'LUMEN' } });

    expect((await findView(db, id, undefined)).me).toBeNull();
  });
});

describe('library', () => {
  test('saved: only mine, full views, newest first', async () => {
    const first = await create(alice, 'Гореть');
    const second = await create(alice, 'Сид и Ненси');
    await setSave(db, bob, first, true);
    await Bun.sleep(5);
    await setSave(db, bob, second, true);
    await setSave(db, alice, first, true);

    const saved = await savedArrangements(db, bob);
    expect(saved.map((view) => view.song.title)).toEqual(['Сид и Ненси', 'Гореть']);
    expect(saved[0]?.me?.saved).toBe(true);
    expect((await savedArrangements(db, alice)).map((view) => view.id)).toEqual([first]);
  });

  test('liked and mine are list items with counters', async () => {
    const mine = await create(alice, 'Гореть');
    await setLike(db, bob, mine, true);
    await recordView(db, mine, 'device:y');

    const item = {
      id: mine,
      artist: 'LUMEN',
      artistSlug: 'lumen',
      artistPictureSmallUrl: null,
      title: 'Гореть',
      songSlug: 'goret',
      views: 1,
      likes: 1,
    };
    expect(await likedArrangements(db, bob)).toEqual([item]);
    expect(await myArrangements(db, alice)).toEqual([item]);
    expect(await myArrangements(db, bob)).toEqual([]);
  });
});
