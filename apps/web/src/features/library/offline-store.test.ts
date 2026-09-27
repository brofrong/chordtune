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
    }).catch(() => {});
    const sent: [string, number][] = [];
    await flushQueue(async (id, times) => {
      sent.push([id, times]);
    });
    expect(sent).toEqual([['a', 1]]);
  });
});
