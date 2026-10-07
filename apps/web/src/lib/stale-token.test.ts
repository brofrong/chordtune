import { describe, expect, test } from 'bun:test';

import { isStaleToken } from './stale-token';

const url = 'https://chordtune.app/api/auth/get-session';

describe('isStaleToken', () => {
  test('no session for a stored token', () => {
    expect(isStaleToken({ url, data: null, storedToken: 't' })).toBe(true);
    expect(isStaleToken({ url: new URL(`${url}?x=1`), data: null, storedToken: 't' })).toBe(true);
  });

  test('a session, no stored token or another route is left alone', () => {
    expect(isStaleToken({ url, data: { session: {} }, storedToken: 't' })).toBe(false);
    expect(isStaleToken({ url, data: null, storedToken: null })).toBe(false);
    expect(isStaleToken({ url: '/api/auth/list-sessions', data: null, storedToken: 't' })).toBe(
      false,
    );
  });
});
