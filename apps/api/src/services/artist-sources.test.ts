import { describe, expect, test } from 'bun:test';

import { createArtistSources, deezerPicture, parseSummary } from './artist-sources';

const PIC = (size: string) =>
  `https://cdn-images.dzcdn.net/images/artist/ec428d21f614b586a7b647f8da435913/${size}-000000-80-0-0.jpg`;

const KINO = {
  id: 4505880,
  name: 'Кино',
  picture_medium: PIC('250x250'),
  picture_xl: PIC('1000x1000'),
  nb_fan: 322981,
  type: 'artist',
};

/** Answers by URL; records every request with its User-Agent. */
function fakeFetch(answer: (url: URL) => unknown) {
  const calls: { url: URL; userAgent: string | null }[] = [];
  const fetch = async (input: string, init: RequestInit) => {
    const url = new URL(input);
    calls.push({ url, userAgent: new Headers(init.headers).get('User-Agent') });
    const body = answer(url);
    return body === undefined ? new Response('missing', { status: 404 }) : Response.json(body);
  };
  return { fetch, calls };
}

function sources(answer: (url: URL) => unknown, options: { now?: () => number } = {}) {
  const fake = fakeFetch(answer);
  return {
    ...fake,
    api: createArtistSources({ userAgent: 'ChordTune (test)', fetch: fake.fetch, ...options }),
  };
}

const wikidata = (url: URL) => url.host === 'www.wikidata.org';
const action = (url: URL) => url.searchParams.get('action');

describe('deezerPicture', () => {
  test('keeps a real picture and drops the placeholder of an artist without one', () => {
    expect(deezerPicture(PIC('250x250'))).toBe(PIC('250x250'));
    expect(
      deezerPicture('https://cdn-images.dzcdn.net/images/artist//250x250-000000-80-0-0.jpg'),
    ).toBeNull();
    expect(deezerPicture(undefined)).toBeNull();
  });
});

describe('parseSummary', () => {
  test('takes the title, description and extract', () => {
    expect(
      parseSummary({
        type: 'standard',
        title: 'Сплин',
        description: 'российская рок-группа',
        extract: '«Сплин» — …',
      }),
    ).toEqual({ title: 'Сплин', description: 'российская рок-группа', extract: '«Сплин» — …' });
  });

  test('skips disambiguation pages and pages without text', () => {
    expect(
      parseSummary({ type: 'disambiguation', title: 'Kino', extract: 'Kino may refer to' }),
    ).toBeNull();
    expect(parseSummary({ type: 'standard', title: 'Kino', extract: '' })).toBeNull();
  });
});

describe('searchDeezer', () => {
  test('returns candidates with the small picture and fans, sending our User-Agent', async () => {
    const { api, calls } = sources(() => ({ data: [KINO] }));
    expect(await api.searchDeezer('Кино')).toEqual([
      { deezerId: 4505880, name: 'Кино', pictureSmallUrl: PIC('250x250'), fans: 322981 },
    ]);
    expect(calls[0]?.url.searchParams.get('q')).toBe('кино');
    expect(calls[0]?.userAgent).toBe('ChordTune (test)');
  });

  test('asks nothing for less than two characters', async () => {
    const { api, calls } = sources(() => ({ data: [KINO] }));
    expect(await api.searchDeezer(' к ')).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  test('caches a query for ten minutes', async () => {
    let time = 0;
    const { api, calls } = sources(() => ({ data: [KINO] }), { now: () => time });
    await api.searchDeezer('Кино');
    await api.searchDeezer('кино ');
    expect(calls).toHaveLength(1);
    time = 10 * 60_000 + 1;
    await api.searchDeezer('кино');
    expect(calls).toHaveLength(2);
  });

  test('an error answered with HTTP 200 fails the search and is not cached', async () => {
    let quota = true;
    const { api } = sources(() =>
      quota
        ? { error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } }
        : { data: [KINO] },
    );
    await expect(api.searchDeezer('Кино')).rejects.toThrow('Quota limit exceeded');
    quota = false;
    expect(await api.searchDeezer('Кино')).toHaveLength(1);
  });
});

describe('getDeezerArtist', () => {
  test('returns the name and both pictures', async () => {
    const { api } = sources(() => KINO);
    expect(await api.getDeezerArtist(4505880)).toEqual({
      deezerId: 4505880,
      name: 'Кино',
      pictureUrl: PIC('1000x1000'),
      pictureSmallUrl: PIC('250x250'),
    });
  });

  test('an unknown id is null', async () => {
    const { api } = sources(() => ({
      error: { type: 'DataException', message: 'no data', code: 800 },
    }));
    expect(await api.getDeezerArtist(1)).toBeNull();
  });
});

describe('findWikidata', () => {
  test('finds the entity by its Deezer artist ID', async () => {
    const { api } = sources((url) =>
      wikidata(url) && url.searchParams.get('srsearch') === 'haswbstatement:P2722=4505880'
        ? { query: { search: [{ title: 'Q650555' }] } }
        : undefined,
    );
    expect(await api.findWikidata({ deezerId: 4505880, name: 'Кино' })).toBe('Q650555');
  });

  test('falls back to an exact label on an entity that has a MusicBrainz artist ID', async () => {
    const { api } = sources((url) => {
      if (action(url) === 'query') return { query: { search: [] } };
      if (action(url) === 'wbsearchentities')
        return {
          search: [
            { id: 'Q19221562', label: 'Сплин' },
            { id: 'Q48339', label: 'Сплин', description: 'российская рок-группа' },
            { id: 'Q2082114', label: 'Сплинтер' },
          ],
        };
      if (action(url) === 'wbgetentities')
        return {
          entities: {
            Q19221562: { claims: {} },
            Q48339: { claims: { P434: [{}] } },
          },
        };
      return undefined;
    });
    expect(await api.findWikidata({ deezerId: 4394822, name: 'сплин' })).toBe('Q48339');
  });

  test('null when nothing matches', async () => {
    const { api } = sources((url) =>
      action(url) === 'wbsearchentities'
        ? { search: [{ id: 'Q1', label: 'Other' }] }
        : { query: { search: [] } },
    );
    expect(await api.findWikidata({ deezerId: null, name: 'Nobody' })).toBeNull();
  });
});

describe('getWiki', () => {
  test('fetches the summaries of the ru and en articles, skipping a missing one', async () => {
    const { api, calls } = sources((url) => {
      if (action(url) === 'wbgetentities')
        return { entities: { Q127939: { sitelinks: { ruwiki: { title: 'Мельница (группа)' } } } } };
      if (url.host === 'ru.wikipedia.org')
        return {
          type: 'standard',
          title: 'Мельница (группа)',
          description: 'российская фолк-рок-группа',
          extract: '«Мельница» — …',
        };
      return undefined;
    });
    expect(await api.getWiki('Q127939')).toEqual({
      ru: {
        title: 'Мельница (группа)',
        description: 'российская фолк-рок-группа',
        extract: '«Мельница» — …',
      },
    });
    expect(calls.at(-1)?.url.pathname).toBe(
      `/api/rest_v1/page/summary/${encodeURIComponent('Мельница_(группа)')}`,
    );
  });
});

describe('searchWikidata', () => {
  test('returns labelled candidates', async () => {
    const { api } = sources(() => ({
      search: [
        { id: 'Q48339', label: 'Сплин', description: 'российская рок-группа' },
        { id: 'Q19221562', label: 'Сплин' },
      ],
    }));
    expect(await api.searchWikidata('Сплин')).toEqual([
      { wikidataId: 'Q48339', label: 'Сплин', description: 'российская рок-группа' },
      { wikidataId: 'Q19221562', label: 'Сплин', description: null },
    ]);
  });
});
