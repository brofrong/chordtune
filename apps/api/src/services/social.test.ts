import { beforeEach, describe, expect, test } from 'bun:test';
import { TRPCError } from '@trpc/server';

import type { Database } from '../db';
import { noopSearch } from '../search';
import { createTestDb, createUser } from '../test/db';
import { saveArrangement } from './save-arrangement';
import { addPlays, recordView, setLike, setSave, viewerState } from './social';

let db: Database;
let alice: string;
let bob: string;
let id: string;

beforeEach(async () => {
  db = await createTestDb();
  alice = await createUser(db, 'alice');
  bob = await createUser(db, 'bob');
  const saved = await saveArrangement(db, noopSearch, {
    authorId: alice,
    input: {
      artist: { name: 'LUMEN' },
      song: { title: 'Гореть' },
      content: '${Am}Зачем',
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
  id = saved.id;
});

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TRPCError);
  return error as TRPCError;
}

describe('recordView', () => {
  test('counts a viewer once per day', async () => {
    expect(await recordView(db, id, 'device-1', '2026-09-27')).toEqual({ views: 1 });
    expect(await recordView(db, id, 'device-1', '2026-09-27')).toEqual({ views: 1 });
    expect(await recordView(db, id, 'device-2', '2026-09-27')).toEqual({ views: 2 });
    expect(await recordView(db, id, 'device-1', '2026-09-28')).toEqual({ views: 3 });
  });
});

describe('setLike', () => {
  test('is idempotent and never goes below zero', async () => {
    expect(await setLike(db, alice, id, true)).toEqual({ likes: 1, liked: true });
    expect(await setLike(db, alice, id, true)).toEqual({ likes: 1, liked: true });
    expect(await setLike(db, bob, id, true)).toEqual({ likes: 2, liked: true });
    expect(await setLike(db, alice, id, false)).toEqual({ likes: 1, liked: false });
    expect(await setLike(db, alice, id, false)).toEqual({ likes: 1, liked: false });
  });
});

describe('setSave', () => {
  test('is idempotent and never goes below zero', async () => {
    expect(await setSave(db, alice, id, true)).toEqual({ saves: 1, saved: true });
    expect(await setSave(db, alice, id, true)).toEqual({ saves: 1, saved: true });
    expect(await setSave(db, alice, id, false)).toEqual({ saves: 0, saved: false });
    expect(await setSave(db, alice, id, false)).toEqual({ saves: 0, saved: false });
  });
});

describe('addPlays', () => {
  test('adds up plays per user', async () => {
    expect(await addPlays(db, alice, id, 3)).toEqual({ played: 3 });
    expect(await addPlays(db, alice, id, 1)).toEqual({ played: 4 });
    expect(await addPlays(db, bob, id, 1)).toEqual({ played: 1 });
  });
});

describe('viewerState', () => {
  test('null for guests, flags and plays for users', async () => {
    expect(await viewerState(db, null, id)).toBeNull();
    expect(await viewerState(db, alice, id)).toEqual({ liked: false, saved: false, played: 0 });
    await setLike(db, alice, id, true);
    await addPlays(db, alice, id, 2);
    expect(await viewerState(db, alice, id)).toEqual({ liked: true, saved: false, played: 2 });
  });
});

describe('missing arrangement', () => {
  test('every action rejects with NOT_FOUND', async () => {
    for (const action of [
      recordView(db, 'nope', 'device-1'),
      setLike(db, alice, 'nope', true),
      setSave(db, alice, 'nope', true),
      addPlays(db, alice, 'nope', 1),
    ]) {
      expect((await rejection(action)).code).toBe('NOT_FOUND');
    }
  });
});
