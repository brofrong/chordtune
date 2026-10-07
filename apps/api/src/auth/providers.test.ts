import { describe, expect, test } from 'bun:test';

import type { AuthConfig } from './config';
import { genericProviders, socialProviders, TRUSTED_PROVIDERS, vkProfileToUser } from './providers';

const passkey = { rpID: 'localhost', origins: [], ios: false, android: false };

describe('providers', () => {
  test('only configured providers are registered', () => {
    const config: AuthConfig = {
      passkey,
      google: { clientId: 'g', clientSecret: 'gs' },
      yandex: { clientId: 'y', clientSecret: 'ys' },
    };
    expect(Object.keys(socialProviders(config))).toEqual(['google']);
    expect(genericProviders(config).map((provider) => provider.providerId)).toEqual(['yandex']);
    expect(Object.keys(socialProviders({ passkey }))).toEqual([]);
  });

  test('only providers that verify email link by it', () => {
    expect([...TRUSTED_PROVIDERS]).toEqual(['google', 'yandex']);
  });
});

describe('vkProfileToUser', () => {
  test('always stands in a verified placeholder, even when VK returns an email', () => {
    const placeholder = { email: 'vk-7@users.invalid', emailVerified: true };
    expect(vkProfileToUser({ user: { user_id: 7, email: 'v@vk.com' } })).toEqual(placeholder);
    expect(vkProfileToUser({ user: { user_id: 7 } })).toEqual(placeholder);
  });
});
