import { describe, expect, test } from 'bun:test';

import { INTERNAL_API_URL, resolveApiUrl } from './api';

describe('resolveApiUrl', () => {
  test('the web build talks to its own origin in the browser', () => {
    expect(
      resolveApiUrl({
        target: 'web',
        browserOrigin: 'https://chordtune.app',
        publicApiUrl: 'https://x',
      }),
    ).toBe('https://chordtune.app');
  });

  test('the web build talks to the API directly on the server', () => {
    expect(resolveApiUrl({ target: 'web', browserOrigin: null, publicApiUrl: undefined })).toBe(
      INTERNAL_API_URL,
    );
  });

  test('the Capacitor build uses the public API URL everywhere', () => {
    for (const browserOrigin of ['capacitor://localhost', null]) {
      expect(
        resolveApiUrl({
          target: 'capacitor',
          browserOrigin,
          publicApiUrl: 'https://chordtune.app',
        }),
      ).toBe('https://chordtune.app');
    }
  });

  test('the Capacitor build without a public API URL fails instead of pointing at localhost', () => {
    expect(() =>
      resolveApiUrl({ target: 'capacitor', browserOrigin: null, publicApiUrl: undefined }),
    ).toThrow('NEXT_PUBLIC_API_URL');
  });

  test('the Capacitor build rejects an address without http(s), which the WebView would resolve against itself', () => {
    for (const publicApiUrl of ['chordtune.app', 'ftp://chordtune.app', 'not a url']) {
      expect(() =>
        resolveApiUrl({ target: 'capacitor', browserOrigin: null, publicApiUrl }),
      ).toThrow('NEXT_PUBLIC_API_URL');
    }
  });

  test('a trailing slash is dropped so paths do not start with //', () => {
    expect(
      resolveApiUrl({
        target: 'capacitor',
        browserOrigin: null,
        publicApiUrl: 'https://chordtune.app/',
      }),
    ).toBe('https://chordtune.app');
  });
});
