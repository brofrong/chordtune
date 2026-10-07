import { describe, expect, test } from 'bun:test';

import {
  appLink,
  createPendingAuth,
  decodeTgAuthResult,
  matchBrowserFlow,
  matchPendingAuth,
  mobileStartUrl,
  PENDING_TTL_MS,
  parseAuthLink,
  pickDisplayName,
} from './mobile-link';

describe('appLink', () => {
  test('round-trips through parseAuthLink', () => {
    const link = appLink({ state: 's', token: 'a+b/c' });
    expect(link.startsWith('app.chordtune://auth?')).toBe(true);
    expect(parseAuthLink(link)).toEqual({ state: 's', token: 'a+b/c', linked: null, error: null });
  });
});

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
      // The ott goes in the fragment, not the query string, so it never reaches server logs.
    ).toBe('https://chordtune.app/ru/auth/mobile?provider=yandex&state=s&mode=link#ott=o');
  });

  test('has no fragment when there is no one-time token', () => {
    expect(
      mobileStartUrl({
        origin: 'https://chordtune.app',
        locale: 'ru',
        provider: 'google',
        state: 's',
        mode: 'sign-in',
      }),
    ).toBe('https://chordtune.app/ru/auth/mobile?provider=google&state=s&mode=sign-in');
  });
});

describe('matchBrowserFlow', () => {
  test('requires state, mode and provider to all agree', () => {
    const flow = { state: 's', mode: 'sign-in' as const, provider: 'google' as const };
    expect(matchBrowserFlow(flow, flow)).toBe(true);
    expect(matchBrowserFlow(flow, { ...flow, state: 'other' })).toBe(false);
    expect(matchBrowserFlow(flow, { ...flow, mode: 'link' })).toBe(false);
    expect(matchBrowserFlow(flow, { ...flow, provider: 'yandex' })).toBe(false);
    expect(matchBrowserFlow(null, flow)).toBe(false);
  });
});

/** Base64url-encodes like Telegram does, including UTF-8 bytes beyond ASCII. */
function encodeTgAuthResult(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

describe('pickDisplayName', () => {
  test('prefers the username over the raw name', () => {
    expect(pickDisplayName({ username: 'dima', name: 'Dmitrii' })).toBe('dima');
  });

  test('falls back to the name when there is no username', () => {
    expect(pickDisplayName({ username: null, name: 'Dmitrii' })).toBe('Dmitrii');
    expect(pickDisplayName({ name: 'Dmitrii' })).toBe('Dmitrii');
  });
});

describe('decodeTgAuthResult', () => {
  test('round-trips a Cyrillic name', () => {
    const data = { id: 1, first_name: 'Дима', hash: 'abc' };
    expect(decodeTgAuthResult(`#tgAuthResult=${encodeTgAuthResult(data)}`)).toEqual(data);
  });

  test('decodes even when the base64url is missing its padding', () => {
    const data = { id: 1 };
    const encoded = encodeTgAuthResult(data);
    expect(encoded.endsWith('=')).toBe(false); // already stripped by encodeTgAuthResult
    expect(decodeTgAuthResult(`#tgAuthResult=${encoded}`)).toEqual(data);
  });

  test('a cancelled login is `false`, not an object', () => {
    expect(decodeTgAuthResult('#tgAuthResult=false')).toBe(false);
  });

  test('garbage and a missing fragment both read as null', () => {
    expect(decodeTgAuthResult('#tgAuthResult=%%%not-base64%%%')).toBeNull();
    expect(decodeTgAuthResult('#other=1')).toBeNull();
    expect(decodeTgAuthResult('')).toBeNull();
  });
});
