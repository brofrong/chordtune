import { describe, expect, test } from 'bun:test';

import { nativeErrorResult, passkeySupported } from './passkeys';

// `isCapacitor` is read once at import time from `NEXT_PUBLIC_BUILD_TARGET`, which `bun test`
// runs without (the web build), so these only exercise the browser branch; the Capacitor
// ios/android branches are exercised on-device (Step 7 of the task).
describe('passkeySupported', () => {
  test('false without server-advertised auth methods', () => {
    expect(passkeySupported(undefined)).toBe(false);
  });

  test('false in a browser without the WebAuthn API (e.g. this test runner, or SSR)', () => {
    expect(
      passkeySupported({
        email: true,
        providers: [],
        telegramBot: null,
        passkey: { web: true, ios: false, android: false },
      }),
    ).toBe(false);
  });
});

describe('nativeErrorResult', () => {
  test('a cancelled system sheet is silent, not an error', () => {
    expect(nativeErrorResult({ code: 'CANCELED' })).toBeUndefined();
  });

  test('every other platform error code surfaces', () => {
    expect(nativeErrorResult({ code: 'DOMAIN_NOT_ASSOCIATED' })).toEqual({
      error: { code: 'DOMAIN_NOT_ASSOCIATED' },
    });
    expect(nativeErrorResult({ code: 'NO_CREDENTIAL' })).toEqual({
      error: { code: 'NO_CREDENTIAL' },
    });
  });

  test('an error without a code still surfaces, as a generic failure', () => {
    expect(nativeErrorResult(new Error('native crash'))).toEqual({ error: { code: 'FAILED' } });
    expect(nativeErrorResult('not even an object')).toEqual({ error: { code: 'FAILED' } });
  });
});
