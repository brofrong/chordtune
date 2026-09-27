import { TRPCError } from '@trpc/server';
import { desc, eq } from 'drizzle-orm';

import type { Database } from '../db';
import { arrangementLike, arrangementSave } from '../db/schema';
import { viewerState } from './social';

export const WITH_DETAILS = {
  song: { with: { artist: true } },
  author: { columns: { id: true, name: true } },
} as const;

export type ArrangementListItem = {
  id: string;
  artist: string;
  artistSlug: string;
  title: string;
  songSlug: string;
  views: number;
  likes: number;
};

type ListRow = {
  id: string;
  viewCount: number;
  likeCount: number;
  song: { title: string; slug: string; artist: { name: string; slug: string } };
};

export function toListItem(row: ListRow): ArrangementListItem {
  return {
    id: row.id,
    artist: row.song.artist.name,
    artistSlug: row.song.artist.slug,
    title: row.song.title,
    songSlug: row.song.slug,
    views: row.viewCount,
    likes: row.likeCount,
  };
}

async function findRows(db: Database, ids: string[]) {
  return db.query.arrangement.findMany({ where: { id: { in: ids } }, with: WITH_DETAILS });
}

export type ArrangementRow = Awaited<ReturnType<typeof findRows>>[number];

/** The song page payload. Drafts are visible to their author only. */
export async function toView(
  db: Database,
  row: ArrangementRow | undefined,
  viewerId: string | undefined,
) {
  if (!row || (row.status === 'draft' && row.authorId !== viewerId)) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  const {
    song,
    author,
    songId: _songId,
    authorId: _authorId,
    viewCount,
    likeCount,
    saveCount,
    ...rest
  } = row;
  const { artist, artistId: _artistId, ...songFields } = song;
  return {
    ...rest,
    author,
    song: songFields,
    artist,
    stats: { views: viewCount, likes: likeCount, saves: saveCount },
    me: await viewerState(db, viewerId ?? null, row.id),
  };
}

export type ArrangementView = Awaited<ReturnType<typeof toView>>;

export async function findView(db: Database, id: string, viewerId: string | undefined) {
  const [row] = await findRows(db, [id]);
  return toView(db, row, viewerId);
}

/** Rows for ids in the given order, skipping ids that no longer exist. */
async function inOrder(db: Database, ids: string[]) {
  if (ids.length === 0) {
    return [];
  }
  const rows = new Map((await findRows(db, ids)).map((row) => [row.id, row]));
  return ids.flatMap((id) => rows.get(id) ?? []);
}

/** Full song pages of the user's saved arrangements, newest first, for offline storage. */
export async function savedArrangements(db: Database, userId: string) {
  const saves = await db
    .select({ id: arrangementSave.arrangementId })
    .from(arrangementSave)
    .where(eq(arrangementSave.userId, userId))
    .orderBy(desc(arrangementSave.createdAt));
  const rows = await inOrder(
    db,
    saves.map((save) => save.id),
  );
  return Promise.all(rows.map((row) => toView(db, row, userId)));
}

export async function likedArrangements(db: Database, userId: string) {
  const likes = await db
    .select({ id: arrangementLike.arrangementId })
    .from(arrangementLike)
    .where(eq(arrangementLike.userId, userId))
    .orderBy(desc(arrangementLike.createdAt));
  return (
    await inOrder(
      db,
      likes.map((like) => like.id),
    )
  ).map(toListItem);
}

export async function myArrangements(db: Database, userId: string) {
  const rows = await db.query.arrangement.findMany({
    where: { authorId: userId },
    orderBy: { createdAt: 'desc' },
    with: WITH_DETAILS,
  });
  return rows.map(toListItem);
}
