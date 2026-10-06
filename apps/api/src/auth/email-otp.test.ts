import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { account, user } from '../db/schema';
import { createTestAuth } from '../test/auth';

let t: Awaited<ReturnType<typeof createTestAuth>>;

beforeEach(async () => {
  t = await createTestAuth({ review: { email: 'review@chordtune.app', code: '424242' } });
});

describe('email code sign-in', () => {
  test('a new email creates a verified user', async () => {
    const { userId } = await t.signIn('new@test.local');
    const [row] = await t.db.select().from(user).where(eq(user.id, userId));
    expect(row).toMatchObject({ email: 'new@test.local', emailVerified: true });
    expect(t.sent[0]?.subject).toContain('код для входа');
  });

  test('a former password user signs in to the same account, even with capitals', async () => {
    await t.db.insert(user).values({ id: 'old', name: 'Old', email: 'alice@test.local' });
    await t.db.insert(account).values({
      id: 'old-credential',
      userId: 'old',
      accountId: 'old',
      providerId: 'credential',
      password: 'hash',
      updatedAt: new Date(),
    });
    const { userId } = await t.signIn('Alice@Test.local');
    expect(userId).toBe('old');
  });

  test('three wrong codes burn the code', async () => {
    await t.auth.api.sendVerificationOTP({ body: { email: 'a@test.local', type: 'sign-in' } });
    const code = t.lastCode();
    for (let i = 0; i < 3; i++) {
      await expect(
        t.auth.api.signInEmailOTP({ body: { email: 'a@test.local', otp: '000000' } }),
      ).rejects.toThrow();
    }
    await expect(
      t.auth.api.signInEmailOTP({ body: { email: 'a@test.local', otp: code } }),
    ).rejects.toThrow();
  });

  test('the review account takes its fixed code and gets no mail', async () => {
    await t.auth.api.sendVerificationOTP({
      body: { email: 'review@chordtune.app', type: 'sign-in' },
    });
    expect(t.sent).toHaveLength(0);
    const result = await t.auth.api.signInEmailOTP({
      body: { email: 'review@chordtune.app', otp: '424242' },
    });
    expect(result.user.email).toBe('review@chordtune.app');
  });

  test('placeholder addresses get no mail', async () => {
    await t.auth.api.sendVerificationOTP({
      body: { email: 'tg-1@users.invalid', type: 'sign-in' },
    });
    expect(t.sent).toHaveLength(0);
  });

  test('passwords are gone', async () => {
    await expect(
      t.auth.api.signUpEmail({ body: { email: 'p@test.local', password: '12345678', name: 'p' } }),
    ).rejects.toThrow();
  });
});
