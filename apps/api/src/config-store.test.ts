import { beforeEach, describe, expect, test } from 'bun:test';

import { authSecret, getConfig, getOrCreateConfig, setConfig } from './config-store';
import type { Database } from './db';
import { createTestDb } from './test/db';

let db: Database;

beforeEach(async () => {
  db = await createTestDb();
});

describe('config store', () => {
  test('a missing key reads as null', async () => {
    expect(await getConfig(db, 'missing')).toBeNull();
  });

  test('a stored value reads back, and storing again replaces it', async () => {
    await setConfig(db, 'limits', { songs: 10 });
    expect(await getConfig<{ songs: number }>(db, 'limits')).toEqual({ songs: 10 });
    await setConfig(db, 'limits', { songs: 20 });
    expect(await getConfig<{ songs: number }>(db, 'limits')).toEqual({ songs: 20 });
  });

  test('getOrCreateConfig creates a value once and keeps returning it', async () => {
    let calls = 0;
    const create = () => {
      calls++;
      return `value-${calls}`;
    };
    expect(await getOrCreateConfig(db, 'key', create)).toBe('value-1');
    expect(await getOrCreateConfig(db, 'key', create)).toBe('value-1');
    expect(calls).toBe(1);
  });

  test('concurrent callers agree on the same value', async () => {
    let calls = 0;
    const create = () => `value-${++calls}`;
    const values = await Promise.all(
      Array.from({ length: 5 }, () => getOrCreateConfig(db, 'key', create)),
    );
    expect(new Set(values).size).toBe(1);
    expect(await getConfig<string>(db, 'key')).toBe(values[0] ?? '');
  });

  test('the auth secret is generated as 64 hex characters and stays the same', async () => {
    const secret = await authSecret(db);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(await authSecret(db)).toBe(secret);
  });
});
