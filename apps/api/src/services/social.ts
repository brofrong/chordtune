import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from '../db';
import {
  arrangement,
  arrangementLike,
  arrangementPlay,
  arrangementSave,
  arrangementView,
} from '../db/schema';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

async function ensureArrangement(tx: Transaction, id: string) {
  const [found] = await tx
    .select({ id: arrangement.id })
    .from(arrangement)
    .where(eq(arrangement.id, id));
  if (!found) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Arrangement not found' });
  }
}

type Counter = 'viewCount' | 'likeCount' | 'saveCount';

/** Adds `delta` to a counter (0 just reads it) and returns the new value. */
async function bump(tx: Transaction, id: string, counter: Counter, delta: number): Promise<number> {
  const column = arrangement[counter];
  const [row] =
    delta === 0
      ? await tx.select({ value: column }).from(arrangement).where(eq(arrangement.id, id))
      : await tx
          .update(arrangement)
          .set({ [counter]: sql`${column} + ${delta}` })
          .where(eq(arrangement.id, id))
          .returning({ value: column });
  return row?.value ?? 0;
}

const today = () => new Date().toISOString().slice(0, 10);

/** Counts a view unless this viewer already viewed the arrangement that day. */
export async function recordView(
  db: Database,
  arrangementId: string,
  viewerKey: string,
  day = today(),
) {
  return db.transaction(async (tx) => {
    await ensureArrangement(tx, arrangementId);
    const inserted = await tx
      .insert(arrangementView)
      .values({ arrangementId, viewerKey, day })
      .onConflictDoNothing()
      .returning();
    return { views: await bump(tx, arrangementId, 'viewCount', inserted.length > 0 ? 1 : 0) };
  });
}

/** Adds or removes a user's row in a like/save table and keeps the counter in step. */
async function toggle(
  db: Database,
  table: typeof arrangementLike | typeof arrangementSave,
  counter: 'likeCount' | 'saveCount',
  userId: string,
  arrangementId: string,
  on: boolean,
): Promise<number> {
  return db.transaction(async (tx) => {
    await ensureArrangement(tx, arrangementId);
    const changed = on
      ? await tx.insert(table).values({ userId, arrangementId }).onConflictDoNothing().returning()
      : await tx
          .delete(table)
          .where(and(eq(table.userId, userId), eq(table.arrangementId, arrangementId)))
          .returning();
    return bump(tx, arrangementId, counter, changed.length === 0 ? 0 : on ? 1 : -1);
  });
}

export async function setLike(db: Database, userId: string, arrangementId: string, liked: boolean) {
  const likes = await toggle(db, arrangementLike, 'likeCount', userId, arrangementId, liked);
  return { likes, liked };
}

export async function setSave(db: Database, userId: string, arrangementId: string, saved: boolean) {
  const saves = await toggle(db, arrangementSave, 'saveCount', userId, arrangementId, saved);
  return { saves, saved };
}

export async function addPlays(db: Database, userId: string, arrangementId: string, times: number) {
  return db.transaction(async (tx) => {
    await ensureArrangement(tx, arrangementId);
    const [row] = await tx
      .insert(arrangementPlay)
      .values({ userId, arrangementId, count: times })
      .onConflictDoUpdate({
        target: [arrangementPlay.userId, arrangementPlay.arrangementId],
        set: { count: sql`${arrangementPlay.count} + ${times}`, lastPlayedAt: new Date() },
      })
      .returning({ count: arrangementPlay.count });
    return { played: row?.count ?? times };
  });
}

/** What the signed-in viewer did with this arrangement; null for guests. */
export async function viewerState(db: Database, userId: string | null, arrangementId: string) {
  if (!userId) {
    return null;
  }
  const mine = <T extends typeof arrangementLike | typeof arrangementSave | typeof arrangementPlay>(
    table: T,
  ) => and(eq(table.userId, userId), eq(table.arrangementId, arrangementId));
  const [liked, saved, play] = await Promise.all([
    db.$count(arrangementLike, mine(arrangementLike)),
    db.$count(arrangementSave, mine(arrangementSave)),
    db.select({ count: arrangementPlay.count }).from(arrangementPlay).where(mine(arrangementPlay)),
  ]);
  return { liked: liked > 0, saved: saved > 0, played: play[0]?.count ?? 0 };
}
