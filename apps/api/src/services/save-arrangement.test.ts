import { beforeEach, describe, expect, test } from 'bun:test';
import { TRPCError } from '@trpc/server';

import type { Database } from '../db';
import { artist, song } from '../db/schema';
import { noopSearch } from '../search';
import { createTestDb, createUser } from '../test/db';
import { type ArrangementInput, saveArrangement } from './save-arrangement';

const base: ArrangementInput = {
  artist: { name: 'Noize MC' },
  song: { title: 'Кошка' },
  content: '[Припев]\n${Dm}Что ей ${A#}снится',
  rhythms: [{ key: 'A', name: 'Шестёрка', kind: 'strum', time: '4/4', steps: [{ stroke: 'D' }] }],
  capo: null,
  tempo: 90,
  key: 'Dm',
  notes: '',
};

async function rejection(promise: Promise<unknown>): Promise<TRPCError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(TRPCError);
  return error as TRPCError;
}

let db: Database;
let authorId: string;

beforeEach(async () => {
  db = await createTestDb();
  authorId = await createUser(db, 'author');
});

describe('saveArrangement', () => {
  test('creates the artist, the song and the arrangement', async () => {
    const saved = await saveArrangement(db, noopSearch, { authorId, input: base });
    expect(saved).toMatchObject({ artistSlug: 'noize-mc', songSlug: 'koshka' });

    const row = await db.query.arrangement.findFirst({
      where: { id: saved.id },
      with: { song: { with: { artist: true } } },
    });
    expect(row).toMatchObject({
      authorId,
      chords: ['Dm', 'A#'],
      tempo: 90,
      key: 'Dm',
      status: 'published',
      song: { title: 'Кошка', artist: { name: 'Noize MC' } },
    });
    expect(row?.rhythms).toEqual(base.rhythms);
  });

  test('reuses an artist and a song regardless of case', async () => {
    const first = await saveArrangement(db, noopSearch, { authorId, input: base });
    const second = await saveArrangement(db, noopSearch, {
      authorId,
      input: { ...base, artist: { name: 'noize mc' }, song: { title: 'кошка' } },
    });
    expect(second.id).not.toBe(first.id);
    expect(await db.$count(artist)).toBe(1);
    expect(await db.$count(song)).toBe(1);
  });

  test('picks a free slug when two names transliterate the same', async () => {
    await saveArrangement(db, noopSearch, {
      authorId,
      input: { ...base, artist: { name: 'Кино' } },
    });
    const kino = await saveArrangement(db, noopSearch, {
      authorId,
      input: { ...base, artist: { name: 'Kino' } },
    });
    expect(kino.artistSlug).toBe('kino-2');
  });

  test('uses existing artist and song by id', async () => {
    const first = await saveArrangement(db, noopSearch, { authorId, input: base });
    const row = await db.query.song.findFirst({ where: { slug: first.songSlug } });
    const again = await saveArrangement(db, noopSearch, {
      authorId,
      input: { ...base, artist: { id: row!.artistId }, song: { id: row!.id } },
    });
    expect(again.songSlug).toBe('koshka');

    const missing = await rejection(
      saveArrangement(db, noopSearch, { authorId, input: { ...base, artist: { id: 'nope' } } }),
    );
    expect(missing.code).toBe('NOT_FOUND');
  });

  test('rejects a rhythm marker without a pattern', async () => {
    const error = await rejection(
      saveArrangement(db, noopSearch, {
        authorId,
        input: { ...base, content: '${Am}a @C${G}b' },
      }),
    );
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.message).toContain('Unknown rhythm: C');
  });

  test('only the author can update', async () => {
    const saved = await saveArrangement(db, noopSearch, { authorId, input: base });
    const stranger = await createUser(db, 'stranger');
    const error = await rejection(
      saveArrangement(db, noopSearch, { authorId: stranger, arrangementId: saved.id, input: base }),
    );
    expect(error.code).toBe('FORBIDDEN');

    const updated = await saveArrangement(db, noopSearch, {
      authorId,
      arrangementId: saved.id,
      input: { ...base, content: '${Am}la', tempo: 100 },
    });
    expect(updated.id).toBe(saved.id);
    const row = await db.query.arrangement.findFirst({ where: { id: saved.id } });
    expect(row).toMatchObject({ content: '${Am}la', chords: ['Am'], tempo: 100 });
  });

  test('syncs the search index after saving', async () => {
    const upserted: string[] = [];
    const search = {
      ...noopSearch,
      upsertArrangement: async (doc: { title: string }) => {
        upserted.push(doc.title);
      },
    };
    await saveArrangement(db, search, { authorId, input: base });
    expect(upserted).toEqual(['Кошка']);
  });
});
