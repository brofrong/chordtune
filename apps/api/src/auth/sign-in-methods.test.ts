import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { account, user } from '../db/schema';
import { createTestAuth } from '../test/auth';
import { LAST_SIGN_IN_METHOD, signInMethodCount } from './sign-in-methods';

describe('signInMethodCount', () => {
  test('counts providers, passkeys and a real verified email; not old passwords', async () => {
    const t = await createTestAuth();
    const { userId } = await t.signIn('a@test.local');
    expect(await signInMethodCount(t.db, userId)).toBe(1);

    await t.db.insert(account).values([
      { id: 'c', userId, accountId: userId, providerId: 'credential', updatedAt: new Date() },
      { id: 'y', userId, accountId: 'y1', providerId: 'yandex', updatedAt: new Date() },
    ]);
    expect(await signInMethodCount(t.db, userId)).toBe(2);

    await t.db.update(user).set({ email: 'tg-1@users.invalid' }).where(eq(user.id, userId));
    expect(await signInMethodCount(t.db, userId)).toBe(1);
  });
});

describe('last sign-in method', () => {
  test('cannot be unlinked; one of two can', async () => {
    const t = await createTestAuth();
    const { userId, headers } = await t.signIn('a@test.local');
    await t.db
      .insert(account)
      .values([{ id: 'y', userId, accountId: 'y1', providerId: 'yandex', updatedAt: new Date() }]);
    // Better Auth 1.7.6's `/unlink-account` selects by the account's own row id, not providerId.
    await t.auth.api.unlinkAccount({ body: { accountId: 'y' }, headers });
    expect(await signInMethodCount(t.db, userId)).toBe(1);

    await t.db.update(user).set({ email: 'tg-1@users.invalid' }).where(eq(user.id, userId));
    await t.db
      .insert(account)
      .values([{ id: 'v', userId, accountId: 'v1', providerId: 'vk', updatedAt: new Date() }]);
    await expect(t.auth.api.unlinkAccount({ body: { accountId: 'v' }, headers })).rejects.toThrow();
  });

  test("an unauthenticated caller hits Better Auth's own auth check, not our guard", async () => {
    const t = await createTestAuth();
    // No headers at all: our hook's nested `getSession` dispatch resolves to `null` (no session),
    // so it must no-op rather than throw — the request still fails, but via `freshSessionMiddleware`
    // (no session), not our `LAST_SIGN_IN_METHOD` guard.
    await expect(t.auth.api.unlinkAccount({ body: { accountId: 'y' } })).rejects.not.toMatchObject({
      body: { code: LAST_SIGN_IN_METHOD },
    });
  });
});
