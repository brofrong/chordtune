import { describe, expect, test } from 'bun:test';

import {
  createPendingAuth,
  matchPendingAuth,
  mobileStartUrl,
  PENDING_TTL_MS,
  parseAuthLink,
} from './mobile-link';

describe('parseAuthLink', () => {
  test('reads token, linked provider and error', () => {
    expect(parseAuthLink('app.chordtune://auth?token=t1&state=s1')).toEqual({
      state: 's1',
      token: 't1',
      linked: null,
      error: null,
    });
    expect(parseAuthLink('app.chordtune://auth?linked=vk&state=s2')?.linked).toBe('vk');
    expect(parseAuthLink('app.chordtune://auth?error=access_denied&state=s3')?.error).toBe(
      'access_denied',
    );
  });

  test('ignores other links and links without state', () => {
    expect(parseAuthLink('app.chordtune://song?id=1')).toBeNull();
    expect(parseAuthLink('https://evil.example/auth?token=t&state=s')).toBeNull();
    expect(parseAuthLink('app.chordtune://auth?token=t')).toBeNull();
  });
});

describe('matchPendingAuth', () => {
  test('state must match and be fresh — even after the app restarts', () => {
    const pending = createPendingAuth('sign-in', 'google', 1_000);
    expect(pending.state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(matchPendingAuth(pending, { state: pending.state }, 2_000)).toBe(true);
    expect(matchPendingAuth(pending, { state: 'other' }, 2_000)).toBe(false);
    expect(matchPendingAuth(pending, { state: pending.state }, 1_000 + PENDING_TTL_MS + 1)).toBe(
      false,
    );
    expect(matchPendingAuth(null, { state: pending.state }, 2_000)).toBe(false);
  });
});

describe('mobileStartUrl', () => {
  test('points the browser at the web page with everything it needs', () => {
    expect(
      mobileStartUrl({
        origin: 'https://chordtune.app',
        locale: 'ru',
        provider: 'yandex',
        state: 's',
        mode: 'link',
        ott: 'o',
      }),
    ).toBe('https://chordtune.app/ru/auth/mobile?provider=yandex&state=s&mode=link&ott=o');
  });
});
