import { lyrics, parse } from '@chordtune/chord-sheet';
import { eq } from 'drizzle-orm';

import type { Database } from '../db';
import { type arrangement, type artist, song } from '../db/schema';
import { otherScript } from '../lib/translit';
import type { ArrangementDoc, ArtistDoc, SearchIndex } from '.';

type ArtistRow = typeof artist.$inferSelect;
type ArrangementRow = typeof arrangement.$inferSelect & {
  song: typeof song.$inferSelect & { artist: ArtistRow };
};

const WITH_SONG_AND_ARTIST = { song: { with: { artist: true } } } as const;

export function toArtistDoc(row: ArtistRow, songCount: number): ArtistDoc {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    nameTranslit: otherScript(row.name),
    songCount,
  };
}

export function toArrangementDoc(row: ArrangementRow): ArrangementDoc {
  const { song: songRow } = row;
  return {
    id: row.id,
    songId: songRow.id,
    songSlug: songRow.slug,
    artistId: songRow.artist.id,
    artistSlug: songRow.artist.slug,
    artist: songRow.artist.name,
    artistTranslit: otherScript(songRow.artist.name),
    title: songRow.title,
    titleTranslit: otherScript(songRow.title),
    lyrics: lyrics(parse(row.content).doc),
    chords: row.chords,
    views: row.viewCount,
    likes: row.likeCount,
    createdAt: row.createdAt.getTime(),
  };
}

/**
 * Pushes one arrangement and its artist to the search index after the transaction commits.
 * Search is secondary, so a failure is logged and never fails the save.
 */
export async function syncArrangement(db: Database, search: SearchIndex, arrangementId: string) {
  try {
    const row = await db.query.arrangement.findFirst({
      where: { id: arrangementId },
      with: WITH_SONG_AND_ARTIST,
    });
    if (!row) {
      return;
    }
    if (row.status === 'published') {
      await search.upsertArrangement(toArrangementDoc(row));
    } else {
      await search.deleteArrangement(row.id);
    }
    const songCount = await db.$count(song, eq(song.artistId, row.song.artistId));
    await search.upsertArtist(toArtistDoc(row.song.artist, songCount));
  } catch (error) {
    console.error(`Search sync failed for arrangement ${arrangementId}`, error);
  }
}

/** Rebuilds both indexes from Postgres. */
export async function reindexAll(db: Database, search: SearchIndex) {
  const artists = await db.query.artist.findMany({ with: { songs: { columns: { id: true } } } });
  const arrangements = await db.query.arrangement.findMany({
    where: { status: 'published' },
    with: WITH_SONG_AND_ARTIST,
  });
  await search.replaceAll(
    artists.map((row) => toArtistDoc(row, row.songs.length)),
    arrangements.map(toArrangementDoc),
  );
  return { artists: artists.length, arrangements: arrangements.length };
}
