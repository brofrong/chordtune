import { TRPCError } from '@trpc/server';
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm';

import type { Database } from '../db';
import { arrangement, artist, song } from '../db/schema';
import type { SearchIndex } from '../search';
import { syncArtist } from '../search/documents';
import type { ArrangementListItem } from './arrangements';
import {
  type ArtistSources,
  WIKI_LANGS,
  type Wiki,
  type WikiLang,
  type WikiSummary,
} from './artist-sources';

/**
 * Finds the artist's Wikidata entity and stores its Wikipedia summaries. Runs after the save that
 * created the artist; a failure is logged and leaves `enrichedAt` empty so a later run retries.
 */
export async function enrichArtist(db: Database, sources: ArtistSources, artistId: string) {
  try {
    const row = await db.query.artist.findFirst({ where: { id: artistId } });
    if (!row) {
      return;
    }
    const wikidataId = await sources.findWikidata({ deezerId: row.deezerId, name: row.name });
    const wiki = wikidataId ? await sources.getWiki(wikidataId) : null;
    await db
      .update(artist)
      .set({ wikidataId, wiki, enrichedAt: new Date() })
      .where(eq(artist.id, artistId));
  } catch (error) {
    console.error(`Enriching artist ${artistId} failed`, error);
  }
}

const TOP_SONGS = 50;

/** The summary in the reader's language, else in the other one. */
export function pickWiki(wiki: Wiki | null, locale: WikiLang) {
  const lang = wiki?.[locale] ? locale : WIKI_LANGS.find((other) => wiki?.[other]);
  const summary: WikiSummary | undefined = lang ? wiki?.[lang] : undefined;
  return lang && summary ? { lang, ...summary } : null;
}

/** The artist page: profile and the songs with a published arrangement, most viewed first. */
export async function artistPage(db: Database, slug: string, locale: WikiLang) {
  const row = await db.query.artist.findFirst({ where: { slug } });
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  const views = sql<number>`sum(${arrangement.viewCount})::int`;
  const likes = sql<number>`sum(${arrangement.likeCount})::int`;
  const songs = await db
    .select({
      title: song.title,
      slug: song.slug,
      views,
      likes,
      // The song's page shows its newest published arrangement, so the card opens that one.
      latestId: sql<string>`(array_agg(${arrangement.id} order by ${arrangement.createdAt} desc))[1]`,
    })
    .from(song)
    .innerJoin(
      arrangement,
      and(eq(arrangement.songId, song.id), eq(arrangement.status, 'published')),
    )
    .where(eq(song.artistId, row.id))
    .groupBy(song.id)
    .orderBy(desc(views), desc(likes), asc(song.title));

  const top: ArrangementListItem[] = songs.slice(0, TOP_SONGS).map((item) => ({
    id: item.latestId,
    artist: row.name,
    artistSlug: row.slug,
    artistPictureSmallUrl: row.pictureSmallUrl,
    title: item.title,
    songSlug: item.slug,
    views: item.views,
    likes: item.likes,
  }));
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    deezerId: row.deezerId,
    wikidataId: row.wikidataId,
    pictureUrl: row.pictureUrl,
    pictureSmallUrl: row.pictureSmallUrl,
    wiki: pickWiki(row.wiki, locale),
    songCount: songs.length,
    top,
  };
}

/** Deezer artists for a query; ones already linked to our artists are found among ours instead. */
export async function deezerCandidates(
  db: Database,
  sources: ArtistSources,
  q: string,
  { includeLinked = false }: { includeLinked?: boolean } = {},
) {
  const candidates = await sources.searchDeezer(q);
  if (includeLinked || candidates.length === 0) {
    return candidates;
  }
  const linked = await db
    .select({ deezerId: artist.deezerId })
    .from(artist)
    .where(
      inArray(
        artist.deezerId,
        candidates.map((candidate) => candidate.deezerId),
      ),
    );
  const taken = new Set(linked.map((row) => row.deezerId));
  return candidates.filter((candidate) => !taken.has(candidate.deezerId));
}

/** An admin's fix of an artist's links; both sources are fetched again right away. */
export async function relinkArtist(
  db: Database,
  search: SearchIndex,
  sources: ArtistSources,
  { id, deezerId, wikidataId }: { id: string; deezerId: number | null; wikidataId: string | null },
) {
  const row = await db.query.artist.findFirst({ where: { id } });
  if (!row) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Artist not found' });
  }
  if (deezerId !== null) {
    const [other] = await db
      .select({ name: artist.name })
      .from(artist)
      .where(and(eq(artist.deezerId, deezerId), ne(artist.id, id)));
    if (other) {
      throw new TRPCError({ code: 'CONFLICT', message: `Already linked to ${other.name}` });
    }
  }
  const deezer = deezerId === null ? null : await sources.getDeezerArtist(deezerId);
  if (deezerId !== null && !deezer) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'Deezer artist not found' });
  }
  const wiki = wikidataId ? await sources.getWiki(wikidataId) : null;
  // The name and slug stay, so links to the artist keep working.
  await db
    .update(artist)
    .set({
      deezerId,
      pictureUrl: deezer?.pictureUrl ?? null,
      pictureSmallUrl: deezer?.pictureSmallUrl ?? null,
      wikidataId,
      wiki,
      enrichedAt: new Date(),
    })
    .where(eq(artist.id, id));
  await syncArtist(db, search, id);
}
