import { TRPCError } from '@trpc/server';
import { and, desc, eq, sql } from 'drizzle-orm';

import type { Database } from '../db';
import { arrangement, user } from '../db/schema';
import { type ArrangementListItem, toListItem, WITH_DETAILS } from './arrangements';

export type Profile = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  createdAt: Date;
  stats: { arrangements: number; likes: number; saves: number };
  isMe: boolean;
};

export type ProfileArrangement = ArrangementListItem & {
  status: 'draft' | 'published';
  createdAt: Date;
};

async function toProfile(
  db: Database,
  row: typeof user.$inferSelect | undefined,
  viewerId: string | undefined,
): Promise<Profile> {
  if (!row?.username) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  const [stats] = await db
    .select({
      arrangements: sql<number>`count(*)::int`,
      likes: sql<number>`coalesce(sum(${arrangement.likeCount}), 0)::int`,
      saves: sql<number>`coalesce(sum(${arrangement.saveCount}), 0)::int`,
    })
    .from(arrangement)
    .where(and(eq(arrangement.authorId, row.id), eq(arrangement.status, 'published')));
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    image: row.image,
    createdAt: row.createdAt,
    stats: stats ?? { arrangements: 0, likes: 0, saves: 0 },
    isMe: viewerId === row.id,
  };
}

export async function profileById(db: Database, userId: string, viewerId?: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  return toProfile(db, row, viewerId);
}

export async function profileByUsername(db: Database, username: string, viewerId?: string) {
  const [row] = await db.select().from(user).where(eq(user.username, username.toLowerCase()));
  return toProfile(db, row, viewerId);
}

/** Rows for ids in the given order, skipping ids that no longer exist. */
async function inOrder(db: Database, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  const rows = await db.query.arrangement.findMany({
    where: { id: { in: ids } },
    with: WITH_DETAILS,
  });
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => byId.get(id) ?? []);
}

/**
 * The cursor is `<createdAt>|<id>` of the last item, so ties on time still page correctly. The time
 * is Postgres's own text with microseconds: a JS `Date` keeps only milliseconds, and two rows in the
 * same millisecond would be skipped or repeated across a page boundary.
 */
const CURSOR_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,6})?$/;

/** The shape alone lets through `2026-02-30`, which Postgres would reject with a 500. */
function isCursorTime(text: string): boolean {
  const parts = CURSOR_TIME.exec(text)?.slice(1, 7).map(Number);
  if (!parts) {
    return false;
  }
  const [year, month, day, hours, minutes, seconds] = parts as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hours &&
    date.getUTCMinutes() === minutes &&
    date.getUTCSeconds() === seconds
  );
}

const createdAtText = sql<string>`to_char(${arrangement.createdAt}, 'YYYY-MM-DD"T"HH24:MI:SS.US')`;

export async function profileArrangements(
  db: Database,
  params: { userId: string; viewerId?: string; cursor?: string | null; limit?: number },
) {
  const { userId, viewerId, cursor, limit = 20 } = params;
  const [cursorTime, cursorId] = cursor ? cursor.split('|') : [];
  if (cursor && !(cursorTime && isCursorTime(cursorTime) && cursorId)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid cursor' });
  }

  // The relational `where`'s `OR` shape isn't honoured by this Drizzle RC for mixed-column ties,
  // so the cursor page is found with the query builder and the full rows are loaded by id after.
  const conditions = [eq(arrangement.authorId, userId)];
  if (viewerId !== userId) {
    conditions.push(eq(arrangement.status, 'published'));
  }
  if (cursorTime && cursorId) {
    conditions.push(
      sql`(${arrangement.createdAt}, ${arrangement.id}) < (${cursorTime}::timestamp, ${cursorId})`,
    );
  }
  const idRows = await db
    .select({ id: arrangement.id, createdAt: createdAtText })
    .from(arrangement)
    .where(and(...conditions))
    .orderBy(desc(arrangement.createdAt), desc(arrangement.id))
    .limit(limit + 1);

  const rows = await inOrder(
    db,
    idRows.map((row) => row.id),
  );
  const page = rows.slice(0, limit);
  const last = idRows[limit - 1];
  return {
    items: page.map(
      (row): ProfileArrangement => ({
        ...toListItem(row),
        status: row.status,
        createdAt: row.createdAt,
      }),
    ),
    nextCursor: idRows.length > limit && last ? `${last.createdAt}|${last.id}` : null,
  };
}
