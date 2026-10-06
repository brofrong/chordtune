import { describe, expect, test } from 'bun:test';

import { androidOrigin, authConfig, authMethods } from './config';
import { isPlaceholderEmail, placeholderEmail } from './placeholder-email';

const base = {
  DATABASE_URL: 'postgres://x',
  BETTER_AUTH_URL: 'https://chordtune.app',
  API_PORT: 4000,
  MEILI_URL: 'http://localhost:7700',
  WEB_ORIGINS: ['https://chordtune.app', 'capacitor://localhost', 'https://localhost'],
  MAIL_FROM: 'ChordTune <no-reply@chordtune.app>',
};

describe('authConfig', () => {
  test('enables only providers with both keys, in a fixed order', () => {
    const config = authConfig({
      ...base,
      GOOGLE_CLIENT_ID: 'g',
      GOOGLE_CLIENT_SECRET: 'gs',
      VK_CLIENT_ID: 'v',
      YANDEX_CLIENT_ID: 'y',
      YANDEX_CLIENT_SECRET: 'ys',
      TELEGRAM_BOT_TOKEN: '123456:abc',
      TELEGRAM_BOT_NAME: 'chordtune_bot',
    });
    expect(authMethods(config).providers).toEqual(['yandex', 'telegram', 'google']);
    expect(authMethods(config).telegramBot).toEqual({ name: 'chordtune_bot', id: '123456' });
  });

  test('passkey RP is the API host; origins are the http(s) web origins plus Android', () => {
    const config = authConfig({ ...base, ANDROID_CERT_SHA256: `${'FF:'.repeat(31)}FF` });
    expect(config.passkey.rpID).toBe('chordtune.app');
    expect(config.passkey.origins).toEqual([
      'https://chordtune.app',
      'https://localhost',
      `android:apk-key-hash:${'_'.repeat(42)}8`,
    ]);
    expect(authMethods(config).passkey).toEqual({ web: true, ios: false, android: true });
  });

  test('review account needs both the email and the code', () => {
    expect(authConfig({ ...base, REVIEW_EMAIL: 'review@chordtune.app' }).review).toBeUndefined();
    expect(
      authConfig({ ...base, REVIEW_EMAIL: 'Review@ChordTune.app', REVIEW_CODE: '424242' }).review,
    ).toEqual({ email: 'review@chordtune.app', code: '424242' });
  });
});

describe('androidOrigin', () => {
  test('accepts colon-separated and plain hex', () => {
    const plain = 'ff'.repeat(32);
    expect(androidOrigin(plain)).toBe(androidOrigin(`${'FF:'.repeat(31)}FF`));
  });
});

describe('placeholder emails', () => {
  test('are recognised and never collide with real domains', () => {
    expect(placeholderEmail('tg', '42')).toBe('tg-42@users.invalid');
    expect(isPlaceholderEmail('tg-42@users.invalid')).toBe(true);
    expect(isPlaceholderEmail('vasya@gmail.com')).toBe(false);
  });
});
