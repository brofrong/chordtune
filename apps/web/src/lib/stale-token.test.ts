import { describe, expect, test } from 'bun:test';

import { isStaleToken } from './stale-token';

const url = 'https://chordtune.app/api/auth/get-session';
const sent = 'Bearer t';

describe('isStaleToken', () => {
  test('no session for the stored token that was sent', () => {
    expect(isStaleToken({ url, data: null, sentAuthorization: sent, storedToken: 't' })).toBe(true);
    expect(
      isStaleToken({
        url: new URL(`${url}?x=1`),
        data: null,
        sentAuthorization: sent,
        storedToken: 't',
      }),
    ).toBe(true);
  });

  test('a session, no stored token or another route is left alone', () => {
    expect(
      isStaleToken({ url, data: { session: {} }, sentAuthorization: sent, storedToken: 't' }),
    ).toBe(false);
    expect(isStaleToken({ url, data: null, sentAuthorization: null, storedToken: null })).toBe(
      false,
    );
    expect(
      isStaleToken({
        url: '/api/auth/list-sessions',
        data: null,
        sentAuthorization: sent,
        storedToken: 't',
      }),
    ).toBe(false);
  });

  test('a token stored while the request was in flight is kept', () => {
    // Sent with no token (or an older one), answered after sign-in stored a fresh one.
    expect(isStaleToken({ url, data: null, sentAuthorization: null, storedToken: 'fresh' })).toBe(
      false,
    );
    expect(isStaleToken({ url, data: null, sentAuthorization: sent, storedToken: 'fresh' })).toBe(
      false,
    );
  });
});
