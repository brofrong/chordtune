import { describe, expect, test } from 'bun:test';

import { passkeySupported } from './passkeys';

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
