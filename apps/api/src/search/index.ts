import {
  type EnqueuedTaskPromise,
  type FederatedMultiSearchParams,
  Meilisearch,
} from 'meilisearch';

import { otherScript } from '../lib/translit';

export type ArtistDoc = {
  id: string;
  name: string;
  slug: string;
  /** The name in the other alphabet, so «лумен» finds LUMEN. */
  nameTranslit: string;
  songCount: number;
  /** Deezer's 250×250 picture; absent in documents indexed before pictures existed. */
  pictureSmallUrl: string | null;
};

export type ArrangementDoc = {
  id: string;
  songId: string;
  songSlug: string;
  artistId: string;
  artistSlug: string;
  artist: string;
  artistTranslit: string;
  artistPictureSmallUrl: string | null;
  title: string;
  titleTranslit: string;
  lyrics: string;
  chords: string[];
  views: number;
  likes: number;
  createdAt: number;
};

export type SongHit = { songId: string; songSlug: string; title: string };

/** Search is a secondary index: Postgres is the source of truth and can rebuild it any time. */
export type SearchIndex = {
  upsertArtist(doc: ArtistDoc): Promise<void>;
  upsertArrangement(doc: ArrangementDoc): Promise<void>;
  deleteArrangement(id: string): Promise<void>;
  searchArtists(q: string, limit?: number): Promise<ArtistDoc[]>;
  searchSongs(artistId: string, q: string, limit?: number): Promise<SongHit[]>;
  search(q: string, limit?: number): Promise<ArrangementDoc[]>;
  replaceAll(artists: ArtistDoc[], arrangements: ArrangementDoc[]): Promise<void>;
};

const ARTISTS = 'artists';
const ARRANGEMENTS = 'arrangements';

async function done(task: EnqueuedTaskPromise) {
  const result = await task.waitTask();
  if (result.status === 'failed') {
    throw new Error(`Meilisearch task ${result.uid} failed: ${result.error?.message}`);
  }
}

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/** The query as typed and transliterated, as federated queries on one index. */
function queries(indexUid: string, q: string, filter?: string) {
  const variants = uniqueBy([q, otherScript(q)], (variant) => variant);
  return variants.map((variant) => ({ indexUid, q: variant, filter }));
}

export function createMeiliSearch(host: string, apiKey?: string): SearchIndex {
  const client = new Meilisearch({ host, apiKey });
  const artists = client.index<ArtistDoc>(ARTISTS);
  const arrangements = client.index<ArrangementDoc>(ARRANGEMENTS);

  let ready: Promise<void> | null = null;
  const ensureSettings = () => {
    ready ??= Promise.all([
      done(
        artists.updateSettings({
          searchableAttributes: ['name', 'nameTranslit'],
          sortableAttributes: ['songCount'],
        }),
      ),
      done(
        arrangements.updateSettings({
          // Order is weight: the song text matters least.
          searchableAttributes: ['artist', 'artistTranslit', 'title', 'titleTranslit', 'lyrics'],
          filterableAttributes: ['artistId', 'chords'],
          sortableAttributes: ['createdAt'],
        }),
      ),
    ]).then(
      () => undefined,
      (error: unknown) => {
        ready = null;
        throw error;
      },
    );
    return ready;
  };

  return {
    async upsertArtist(doc) {
      await ensureSettings();
      await artists.addDocuments([doc], { primaryKey: 'id' });
    },

    async upsertArrangement(doc) {
      await ensureSettings();
      await arrangements.addDocuments([doc], { primaryKey: 'id' });
    },

    async deleteArrangement(id) {
      await arrangements.deleteDocument(id);
    },

    async searchArtists(q, limit = 8) {
      await ensureSettings();
      if (!q.trim()) {
        const { hits } = await artists.search('', { limit, sort: ['songCount:desc'] });
        return hits;
      }
      const { hits } = await client.multiSearch<FederatedMultiSearchParams, ArtistDoc>({
        federation: { limit },
        queries: queries(ARTISTS, q),
      });
      return uniqueBy(hits, (hit) => hit.id);
    },

    async searchSongs(artistId, q, limit = 8) {
      await ensureSettings();
      const { hits } = await client.multiSearch<FederatedMultiSearchParams, ArrangementDoc>({
        federation: { limit: 50 },
        queries: queries(ARRANGEMENTS, q, `artistId = ${JSON.stringify(artistId)}`),
      });
      return uniqueBy(hits, (hit) => hit.songId)
        .slice(0, limit)
        .map(({ songId, songSlug, title }) => ({ songId, songSlug, title }));
    },

    async search(q, limit = 20) {
      await ensureSettings();
      if (!q.trim()) {
        const { hits } = await arrangements.search('', { limit, sort: ['createdAt:desc'] });
        return hits;
      }
      const { hits } = await client.multiSearch<FederatedMultiSearchParams, ArrangementDoc>({
        federation: { limit },
        queries: queries(ARRANGEMENTS, q),
      });
      return uniqueBy(hits, (hit) => hit.id);
    },

    async replaceAll(artistDocs, arrangementDocs) {
      await ensureSettings();
      await done(artists.deleteAllDocuments());
      await done(arrangements.deleteAllDocuments());
      if (artistDocs.length > 0) {
        await done(artists.addDocuments(artistDocs, { primaryKey: 'id' }));
      }
      if (arrangementDocs.length > 0) {
        await done(arrangements.addDocuments(arrangementDocs, { primaryKey: 'id' }));
      }
    },
  };
}

/** For tests and for running without Meilisearch. */
export const noopSearch: SearchIndex = {
  upsertArtist: async () => {},
  upsertArrangement: async () => {},
  deleteArrangement: async () => {},
  searchArtists: async () => [],
  searchSongs: async () => [],
  search: async () => [],
  replaceAll: async () => {},
};
