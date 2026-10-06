import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { arrangement, session } from '../db/schema';
import { noopSearch } from '../search';
import { saveArrangement } from '../services/save-arrangement';
import { createTestAuth } from '../test/auth';
import { isRecentSignIn } from './delete-account';

const input = {
  artist: { name: 'LUMEN' },
  song: { title: 'Гореть' },
  content: '${Am}la',
  rhythms: [],
  capo: null,
  tempo: null,
  key: null,
  notes: '',
  tuning: 'standard' as const,
  voicings: {},
  zenMode: null,
};

describe('isRecentSignIn', () => {
  test('ten minutes', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    expect(isRecentSignIn(new Date('2026-10-07T11:51:00Z'), now)).toBe(true);
    expect(isRecentSignIn(new Date('2026-10-07T11:49:00Z'), now)).toBe(false);
  });
});

describe('deleting an account', () => {
  test('keeps published arrangements with no author', async () => {
    const t = await createTestAuth();
    const { userId, headers } = await t.signIn('a@test.local');
    const saved = await saveArrangement(t.db, noopSearch, { authorId: userId, input });

    await t.auth.api.deleteUser({ body: {}, headers });

    const [row] = await t.db.select().from(arrangement).where(eq(arrangement.id, saved.id));
    expect(row?.authorId).toBeNull();
  });

  test('needs a recent sign-in', async () => {
    const t = await createTestAuth();
    const { userId, headers } = await t.signIn('a@test.local');
    await t.db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(session.userId, userId));
    await expect(t.auth.api.deleteUser({ body: {}, headers })).rejects.toThrow();
  });
});
