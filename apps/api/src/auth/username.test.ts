import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { user } from '../db/schema';
import { createTestAuth } from '../test/auth';
import { createTestDb } from '../test/db';
import { backfillUsernames, isValidUsername, uniqueUsername, usernameBase } from './username';

describe('usernameBase', () => {
  test('first usable candidate, transliterated and cleaned', () => {
    expect(usernameBase(['Вася Пупкин'])).toBe('vasya_pupkin');
    expect(usernameBase([null, 'ivan.petrov+tag'])).toBe('ivan_petrov_tag');
    expect(usernameBase(['!!!', 'Kino'])).toBe('kino');
  });

  test('pads short results, trims long ones, avoids reserved names', () => {
    expect(usernameBase(['ab'])).toMatch(/^ab\d{1,}$/);
    expect(usernameBase(['ab']).length).toBeGreaterThanOrEqual(3);
    expect(usernameBase(['a'.repeat(50)])).toHaveLength(30);
    expect(usernameBase(['admin'])).not.toBe('admin');
    expect(usernameBase([])).toBe('user');
  });
});

describe('isValidUsername', () => {
  test('format and reserved list', () => {
    expect(isValidUsername('vasya_2')).toBe(true);
    expect(isValidUsername('Vasya')).toBe(false);
    expect(isValidUsername('va')).toBe(false);
    expect(isValidUsername('profile')).toBe(false);
  });
});

describe('uniqueUsername', () => {
  test('adds a number on collision', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: '1', name: 'a', email: 'a@x', username: 'vasya' });
    await db.insert(user).values({ id: '2', name: 'b', email: 'b@x', username: 'vasya2' });
    expect(await uniqueUsername(db, 'vasya')).toBe('vasya3');
    expect(await uniqueUsername(db, 'petya')).toBe('petya');
  });
});

describe('new users', () => {
  test('get a username from the email, not from a placeholder', async () => {
    const t = await createTestAuth();
    const { userId } = await t.signIn('Ivan.Petrov@test.local');
    const [row] = await t.db.select().from(user).where(eq(user.id, userId));
    expect(row?.username).toBe('ivan_petrov');
  });
});

describe('backfillUsernames', () => {
  test('fills only missing ones', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: '1', name: 'Маша', email: 'masha@x.ru' });
    await db.insert(user).values({ id: '2', name: 'Kept', email: 'kept@x.ru', username: 'kept' });
    expect(await backfillUsernames(db)).toBe(1);
    const rows = await db.select({ id: user.id, username: user.username }).from(user);
    expect(rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: '1', username: 'masha' },
      { id: '2', username: 'kept' },
    ]);
  });
});
