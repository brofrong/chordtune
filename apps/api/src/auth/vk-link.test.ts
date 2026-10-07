import { afterEach, describe, expect, test } from 'bun:test';
import { and, eq } from 'drizzle-orm';

import { account } from '../db/schema';
import { createTestAuth } from '../test/auth';

const realFetch = globalThis.fetch;

/** Stands in for VK ID: the token exchange and the user info a VK sign-in asks for. */
function fakeVk(user: Record<string, unknown>) {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith('https://id.vk.com/oauth2/auth')) {
      return Response.json({ access_token: 'vk-access', token_type: 'bearer', expires_in: 3600 });
    }
    if (url.startsWith('https://id.vk.com/oauth2/user_info')) {
      return Response.json({ user });
    }
    return realFetch(input, init);
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

const ORIGIN = 'http://localhost:3000';

describe('linking VK', () => {
  test('a signed-in user links VK even when VK returns an email', async () => {
    const t = await createTestAuth({ vk: { clientId: 'v', clientSecret: 'vs' } });
    const { userId, token } = await t.signIn('a@test.local');

    const start = await t.auth.handler(
      new Request('http://localhost:4000/api/auth/link-social', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: ORIGIN,
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ provider: 'vk', callbackURL: `${ORIGIN}/ru/profile/security` }),
      }),
    );
    const { url } = (await start.json()) as { url: string };
    const state = new URL(url).searchParams.get('state');
    const cookie = start.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');

    fakeVk({ user_id: 42, first_name: 'Вера', last_name: 'К', email: 'someone@vk.com' });
    const callback = await t.auth.handler(
      new Request(`http://localhost:4000/api/auth/callback/vk?code=c&state=${state}&device_id=d`, {
        headers: { cookie, authorization: `Bearer ${token}` },
      }),
    );

    expect(callback.headers.get('location')).toBe(`${ORIGIN}/ru/profile/security`);
    const rows = await t.db
      .select()
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, 'vk')));
    expect(rows.map((row) => row.accountId)).toEqual(['42']);
  });
});
