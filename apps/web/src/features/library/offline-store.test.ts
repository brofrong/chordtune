/// <reference types="bun" />

import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, test } from 'bun:test';

import type { ArrangementView } from '@/lib/trpc';
import {
  enqueuePlayed,
  flushQueue,
  getOffline,
  listOffline,
  reconcileOffline,
  removeOffline,
  resetOfflineStore,
  saveOffline,
} from './offline-store';

const song = (id: string, title = id) =>
  ({ id, song: { title }, content: '${Am}la' }) as unknown as ArrangementView;

beforeEach(async () => {
  await resetOfflineStore();
});

describe('songs', () => {
  test('save, read, list newest first, remove', async () => {
    await saveOffline(song('a'));
    await Bun.sleep(2);
    await saveOffline(song('b'));
    expect((await getOffline('a'))?.id).toBe('a');
    expect(await getOffline('nope')).toBeNull();
    expect((await listOffline()).map((s) => s.id)).toEqual(['b', 'a']);
    await removeOffline('a');
    expect((await listOffline()).map((s) => s.id)).toEqual(['b']);
  });

  test('reconcile drops songs unsaved elsewhere and refreshes the rest', async () => {
    await saveOffline(song('a', 'old title'));
    await saveOffline(song('gone'));
    await reconcileOffline([song('a', 'new title'), song('c')]);
    const ids = (await listOffline()).map((s) => s.id).sort();
    expect(ids).toEqual(['a', 'c']);
    expect((await getOffline('a'))?.song.title).toBe('new title');
  });
});

describe('played queue', () => {
  test('plays of the same song go out as one request', async () => {
    await enqueuePlayed('a');
    await enqueuePlayed('a');
    await enqueuePlayed('a');
    await enqueuePlayed('b', 2);
    const sent: [string, number][] = [];
    await flushQueue(async (id, times) => {
      sent.push([id, times]);
    });
    expect(sent.sort()).toEqual([
      ['a', 3],
      ['b', 2],
    ]);
    const again: [string, number][] = [];
    await flushQueue(async (id, times) => {
      again.push([id, times]);
    });
    expect(again).toEqual([]);
  });

  test('a failed send keeps the plays for later', async () => {
    await enqueuePlayed('a');
    await flushQueue(async () => {
      throw new Error('offline');
    });
    const sent: [string, number][] = [];
    await flushQueue(async (id, times) => {
      sent.push([id, times]);
    });
    expect(sent).toEqual([['a', 1]]);
  });

  test('a song the server rejects is dropped and does not block the others', async () => {
    await enqueuePlayed('gone');
    await enqueuePlayed('b');
    const sent: [string, number][] = [];
    await flushQueue(
      async (id, times) => {
        if (id === 'gone') {
          throw new Error('NOT_FOUND');
        }
        sent.push([id, times]);
      },
      { drop: (error) => (error as Error).message === 'NOT_FOUND' },
    );
    expect(sent).toEqual([['b', 1]]);
    const again: string[] = [];
    await flushQueue(async (id) => {
      again.push(id);
    });
    expect(again).toEqual([]);
  });

  test('a network failure for one song still sends the others and keeps the failed one', async () => {
    await enqueuePlayed('a');
    await enqueuePlayed('b');
    const sent: string[] = [];
    await flushQueue(async (id) => {
      if (id === 'a') {
        throw new Error('offline');
      }
      sent.push(id);
    });
    expect(sent).toEqual(['b']);
    const again: string[] = [];
    await flushQueue(async (id) => {
      again.push(id);
    });
    expect(again).toEqual(['a']);
  });

  test('more than 50 plays go out in chunks the API accepts', async () => {
    await enqueuePlayed('a', 60);
    const sent: number[] = [];
    await flushQueue(async (_id, times) => {
      sent.push(times);
    });
    expect(sent).toEqual([50, 10]);
  });
});
