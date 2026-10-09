import { beforeEach, describe, expect, test } from 'bun:test';
import { eq, sql } from 'drizzle-orm';

import type { Database } from '../db';
import { arrangement, user } from '../db/schema';
import { noopSearch } from '../search';
import { createTestDb, createUser } from '../test/db';
import { profileArrangements, profileByUsername } from './profile';
import { saveArrangement } from './save-arrangement';
import { setLike, setSave } from './social';

let db: Database;

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
  await createUser(db, 'alice');
  await createUser(db, 'bob');
  await db.update(user).set({ username: 'alice' }).where(eq(user.id, 'alice'));
});

describe('profileByUsername', () => {
  test('counts published arrangements and what others did with them', async () => {
    const first = await create('alice', 'Гореть');
    const draft = await create('alice', 'Черновик');
    await db.update(arrangement).set({ status: 'draft' }).where(eq(arrangement.id, draft));
    await setLike(db, 'bob', first, true);
    await setSave(db, 'bob', first, true);
    await setLike(db, 'bob', draft, true);

    const profile = await profileByUsername(db, 'alice', 'bob');
    expect(profile).toMatchObject({
      id: 'alice',
      username: 'alice',
      stats: { arrangements: 1, likes: 1, saves: 1 },
      isMe: false,
    });
    expect((await profileByUsername(db, 'ALICE', 'alice')).isMe).toBe(true);
  });

  test('unknown username is not found', async () => {
    await expect(profileByUsername(db, 'nobody')).rejects.toThrow();
  });
});

describe('profileArrangements', () => {
  test('drafts only for the owner, newest first, paged', async () => {
    const a = await create('alice', 'A');
    await Bun.sleep(5);
    const b = await create('alice', 'B');
    await Bun.sleep(5);
    const c = await create('alice', 'C');
    await db.update(arrangement).set({ status: 'draft' }).where(eq(arrangement.id, c));

    const asBob = await profileArrangements(db, { userId: 'alice', viewerId: 'bob' });
    expect(asBob.items.map((item) => item.id)).toEqual([b, a]);

    const page1 = await profileArrangements(db, { userId: 'alice', viewerId: 'alice', limit: 2 });
    expect(page1.items.map((item) => item.id)).toEqual([c, b]);
    const page2 = await profileArrangements(db, {
      userId: 'alice',
      viewerId: 'alice',
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((item) => item.id)).toEqual([a]);
    expect(page2.nextCursor).toBeNull();
  });

  test('pages across rows in the same millisecond', async () => {
    const [a, b, c] = [
      await create('alice', 'A'),
      await create('alice', 'B'),
      await create('alice', 'C'),
    ];
    // Same millisecond, different microseconds; ids are random, so their order doesn't help.
    const times = [
      '2026-10-07 12:00:00.123400',
      '2026-10-07 12:00:00.123700',
      '2026-10-07 12:00:00.123500',
    ];
    for (const [i, id] of [a, b, c].entries()) {
      await db
        .update(arrangement)
        .set({ createdAt: sql`${times[i]}::timestamp` })
        .where(eq(arrangement.id, id));
    }
    const newestFirst = [b, c, a];

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const page: Awaited<ReturnType<typeof profileArrangements>> = await profileArrangements(db, {
        userId: 'alice',
        limit: 1,
        cursor,
      });
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
    } while (cursor);
    expect(seen).toEqual(newestFirst);
  });

  test('a malformed cursor is refused', async () => {
    await expect(profileArrangements(db, { userId: 'alice', cursor: "x'|y" })).rejects.toThrow(
      'Invalid cursor',
    );
  });

  test('a cursor with an impossible date is refused, not a database error', async () => {
    for (const time of ['2026-13-01T00:00:00', '2026-02-30T00:00:00', '2026-01-01T25:00:00']) {
      await expect(
        profileArrangements(db, { userId: 'alice', cursor: `${time}|x` }),
      ).rejects.toThrow('Invalid cursor');
    }
  });
});
