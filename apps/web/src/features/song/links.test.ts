import { describe, expect, test } from 'bun:test';

import { artistHref, wikipediaUrl } from './links';

describe('artistHref', () => {
  test('a page per artist on the web, the slug in the query in the app', () => {
    expect(artistHref({ slug: 'kino' }, false)).toBe('/artists/kino');
    expect(artistHref({ slug: 'kino' }, true)).toEqual({
      pathname: '/artist',
      query: { slug: 'kino' },
    });
  });
});

describe('wikipediaUrl', () => {
  test('points at the article in its language', () => {
    expect(wikipediaUrl({ lang: 'ru', title: 'Кино (группа)' })).toBe(
      `https://ru.wikipedia.org/wiki/${encodeURIComponent('Кино_(группа)')}`,
    );
  });
});
