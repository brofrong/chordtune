import { type DBSchema, deleteDB, type IDBPDatabase, openDB } from 'idb';

import type { ArrangementView } from '@/lib/trpc';

const DB_NAME = 'chordtune';

type StoredSong = { id: string; arrangement: ArrangementView; savedAt: number };
type QueuedPlay = { key?: number; arrangementId: string; times: number };

interface OfflineSchema extends DBSchema {
  songs: { key: string; value: StoredSong };
  queue: { key: number; value: QueuedPlay };
}

let connection: Promise<IDBPDatabase<OfflineSchema>> | null = null;

function db() {
  connection ??= openDB<OfflineSchema>(DB_NAME, 1, {
    upgrade(database) {
      database.createObjectStore('songs', { keyPath: 'id' });
      database.createObjectStore('queue', { keyPath: 'key', autoIncrement: true });
    },
  });
  return connection;
}

/** Drops everything; for tests. */
export async function resetOfflineStore() {
  const open = connection;
  connection = null;
  (await open)?.close();
  await deleteDB(DB_NAME);
}

export async function saveOffline(arrangement: ArrangementView) {
  await (await db()).put('songs', { id: arrangement.id, arrangement, savedAt: Date.now() });
}

export async function removeOffline(id: string) {
  await (await db()).delete('songs', id);
}

export async function getOffline(id: string): Promise<ArrangementView | null> {
  return (await (await db()).get('songs', id))?.arrangement ?? null;
}

/** Saved songs, newest first. */
export async function listOffline(): Promise<ArrangementView[]> {
  const songs = await (await db()).getAll('songs');
  return songs.sort((a, b) => b.savedAt - a.savedAt).map((song) => song.arrangement);
}

/** Makes the device match the server list: refresh what is there, drop what was unsaved. */
export async function reconcileOffline(server: ArrangementView[]) {
  const database = await db();
  const tx = database.transaction('songs', 'readwrite');
  const keep = new Set(server.map((arrangement) => arrangement.id));
  const existing = new Map((await tx.store.getAll()).map((song) => [song.id, song]));
  for (const id of existing.keys()) {
    if (!keep.has(id)) {
      await tx.store.delete(id);
    }
  }
  const now = Date.now();
  for (const [index, arrangement] of server.entries()) {
    const savedAt = existing.get(arrangement.id)?.savedAt ?? now - index;
    await tx.store.put({ id: arrangement.id, arrangement, savedAt });
  }
  await tx.done;
}

export async function enqueuePlayed(arrangementId: string, times = 1) {
  await (await db()).add('queue', { arrangementId, times });
}

/** The API accepts at most this many plays per request. */
const MAX_PLAYS_PER_REQUEST = 50;

/**
 * Sends queued plays, one song at a time in chunks the API accepts. A song whose request fails
 * keeps its unsent plays for the next attempt, unless `drop` says the server rejected it for good
 * (e.g. the song was deleted); either way the other songs still go out.
 */
export async function flushQueue(
  send: (arrangementId: string, times: number) => Promise<void>,
  options: { drop?: (error: unknown) => boolean } = {},
) {
  const database = await db();
  const queued = await database.getAll('queue');
  const bySong = new Map<string, { times: number; keys: number[] }>();
  for (const play of queued) {
    const entry = bySong.get(play.arrangementId) ?? { times: 0, keys: [] };
    entry.times += play.times;
    if (play.key !== undefined) {
      entry.keys.push(play.key);
    }
    bySong.set(play.arrangementId, entry);
  }

  for (const [arrangementId, { times, keys }] of bySong) {
    let left = times;
    try {
      while (left > 0) {
        const chunk = Math.min(left, MAX_PLAYS_PER_REQUEST);
        await send(arrangementId, chunk);
        left -= chunk;
      }
    } catch (error) {
      if (options.drop?.(error)) {
        left = 0;
      }
    }
    if (left === times) {
      continue;
    }
    // Replace this song's entries with what is still unsent.
    const tx = database.transaction('queue', 'readwrite');
    await Promise.all([
      ...keys.map((key) => tx.store.delete(key)),
      ...(left > 0 ? [tx.store.add({ arrangementId, times: left })] : []),
      tx.done,
    ]);
  }
}
