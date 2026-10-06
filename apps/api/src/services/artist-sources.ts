export const WIKI_LANGS = ['ru', 'en'] as const;
export type WikiLang = (typeof WIKI_LANGS)[number];
export type WikiSummary = { title: string; description: string | null; extract: string };
export type Wiki = Partial<Record<WikiLang, WikiSummary>>;

export type DeezerCandidate = {
  deezerId: number;
  name: string;
  pictureSmallUrl: string | null;
  fans: number;
};
export type DeezerArtist = {
  deezerId: number;
  name: string;
  pictureUrl: string | null;
  pictureSmallUrl: string | null;
};
export type WikidataCandidate = { wikidataId: string; label: string; description: string | null };

/** Where artist profiles come from; tests pass a fake. */
export type ArtistSources = {
  searchDeezer(q: string): Promise<DeezerCandidate[]>;
  getDeezerArtist(deezerId: number): Promise<DeezerArtist | null>;
  findWikidata(artist: { deezerId: number | null; name: string }): Promise<string | null>;
  searchWikidata(q: string): Promise<WikidataCandidate[]>;
  getWiki(wikidataId: string): Promise<Wiki>;
};

/** For tests and scripts that create artists without looking anything up. */
export const noArtistSources: ArtistSources = {
  searchDeezer: async () => [],
  getDeezerArtist: async () => null,
  findWikidata: async () => null,
  searchWikidata: async () => [],
  getWiki: async () => ({}),
};

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const DEEZER_NO_DATA = 800;
const CACHE_LIMIT = 500;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null);
const list = (value: unknown) => (Array.isArray(value) ? value : []);

/** Deezer answers an artist without a photo with a placeholder whose path has an empty hash. */
export function deezerPicture(url: unknown): string | null {
  const value = text(url);
  return value && !value.includes('/artist//') ? value : null;
}

/** Deezer reports errors, quota included, as HTTP 200 with an `error` object. */
class DeezerError extends Error {
  constructor(
    readonly code: unknown,
    message: string,
  ) {
    super(message);
  }
}

function deezerData(json: unknown): Record<string, unknown> {
  if (!isRecord(json)) throw new Error('Unexpected Deezer answer');
  if (isRecord(json.error)) {
    throw new DeezerError(json.error.code, text(json.error.message) ?? 'Deezer error');
  }
  return json;
}

function parseDeezerSearch(json: unknown): DeezerCandidate[] {
  return list(deezerData(json).data).flatMap((item) => {
    const name = isRecord(item) ? text(item.name) : null;
    if (!isRecord(item) || typeof item.id !== 'number' || !name) return [];
    return [
      {
        deezerId: item.id,
        name,
        pictureSmallUrl: deezerPicture(item.picture_medium),
        fans: typeof item.nb_fan === 'number' ? item.nb_fan : 0,
      },
    ];
  });
}

function parseDeezerArtist(json: unknown): DeezerArtist | null {
  const item = deezerData(json);
  const name = text(item.name);
  if (typeof item.id !== 'number' || !name) return null;
  return {
    deezerId: item.id,
    name,
    pictureUrl: deezerPicture(item.picture_xl),
    pictureSmallUrl: deezerPicture(item.picture_medium),
  };
}

function parseEntitySearch(json: unknown): WikidataCandidate[] {
  return list(isRecord(json) ? json.search : null).flatMap((item) => {
    const wikidataId = isRecord(item) ? text(item.id) : null;
    const label = isRecord(item) ? text(item.label) : null;
    if (!isRecord(item) || !wikidataId || !label) return [];
    return [{ wikidataId, label, description: text(item.description) }];
  });
}

type Entity = { sitelinks: Partial<Record<WikiLang, string>>; isArtist: boolean };

function parseEntities(json: unknown): Record<string, Entity> {
  const entities = isRecord(json) && isRecord(json.entities) ? json.entities : {};
  return Object.fromEntries(
    Object.entries(entities).map(([id, entity]) => {
      const sitelinks = isRecord(entity) && isRecord(entity.sitelinks) ? entity.sitelinks : {};
      const claims = isRecord(entity) && isRecord(entity.claims) ? entity.claims : {};
      const titles: Partial<Record<WikiLang, string>> = {};
      for (const lang of WIKI_LANGS) {
        const link = sitelinks[`${lang}wiki`];
        const title = isRecord(link) ? text(link.title) : null;
        if (title) titles[lang] = title;
      }
      // Only musicians have a MusicBrainz artist ID, so an album or a film of the same name has not.
      return [id, { sitelinks: titles, isArtist: list(claims.P434).length > 0 }];
    }),
  );
}

export function parseSummary(json: unknown): WikiSummary | null {
  if (!isRecord(json) || json.type === 'disambiguation') return null;
  const title = text(json.title);
  const extract = text(json.extract);
  return title && extract ? { title, description: text(json.description), extract } : null;
}

export function createArtistSources({
  userAgent,
  fetch: fetchJson = fetch,
  timeoutMs = 5_000,
  cacheMs = 10 * 60_000,
  now = Date.now,
}: {
  userAgent: string;
  fetch?: Fetch;
  timeoutMs?: number;
  cacheMs?: number;
  now?: () => number;
}): ArtistSources {
  const get = async (url: string): Promise<unknown> => {
    const response = await fetchJson(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`${response.status} from ${url}`);
    return response.json();
  };
  const wikidata = (params: Record<string, string>) =>
    get(
      `https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`,
    );
  const searchCache = new Map<string, { at: number; value: DeezerCandidate[] }>();

  return {
    async searchDeezer(q) {
      const key = q.trim().toLowerCase();
      if (key.length < 2) return [];
      const cached = searchCache.get(key);
      if (cached && now() - cached.at <= cacheMs) return cached.value;
      const value = parseDeezerSearch(
        await get(
          `https://api.deezer.com/search/artist?${new URLSearchParams({ q: key, limit: '5' })}`,
        ),
      );
      searchCache.delete(key);
      searchCache.set(key, { at: now(), value });
      if (searchCache.size > CACHE_LIMIT) {
        const oldest = searchCache.keys().next().value;
        if (oldest !== undefined) searchCache.delete(oldest);
      }
      return value;
    },

    async getDeezerArtist(deezerId) {
      try {
        return parseDeezerArtist(await get(`https://api.deezer.com/artist/${deezerId}`));
      } catch (error) {
        if (error instanceof DeezerError && error.code === DEEZER_NO_DATA) return null;
        throw error;
      }
    },

    async findWikidata({ deezerId, name }) {
      if (deezerId !== null) {
        const found = await wikidata({
          action: 'query',
          list: 'search',
          srsearch: `haswbstatement:P2722=${deezerId}`,
          srlimit: '1',
        });
        const [first] = list(isRecord(found) && isRecord(found.query) ? found.query.search : null);
        const id = isRecord(first) ? text(first.title) : null;
        if (id) return id;
      }
      const wanted = name.trim().toLowerCase();
      const candidates = parseEntitySearch(
        await wikidata({
          action: 'wbsearchentities',
          search: name,
          language: 'ru',
          uselang: 'ru',
          type: 'item',
          limit: '7',
        }),
      ).filter((candidate) => candidate.label.toLowerCase() === wanted);
      if (candidates.length === 0) return null;
      const entities = parseEntities(
        await wikidata({
          action: 'wbgetentities',
          ids: candidates.map((c) => c.wikidataId).join('|'),
          props: 'claims',
        }),
      );
      return (
        candidates.find((candidate) => entities[candidate.wikidataId]?.isArtist)?.wikidataId ?? null
      );
    },

    async searchWikidata(q) {
      if (!q.trim()) return [];
      return parseEntitySearch(
        await wikidata({
          action: 'wbsearchentities',
          search: q,
          language: 'ru',
          uselang: 'ru',
          type: 'item',
          limit: '8',
        }),
      );
    },

    async getWiki(wikidataId) {
      const entity = parseEntities(
        await wikidata({
          action: 'wbgetentities',
          ids: wikidataId,
          props: 'sitelinks',
          sitefilter: 'ruwiki|enwiki',
        }),
      )[wikidataId];
      const wiki: Wiki = {};
      for (const lang of WIKI_LANGS) {
        const title = entity?.sitelinks[lang];
        if (!title) continue;
        const summary = parseSummary(
          await get(
            `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`,
          ),
        );
        if (summary) wiki[lang] = summary;
      }
      return wiki;
    },
  };
}
