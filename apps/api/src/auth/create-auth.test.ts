import { describe, expect, test } from 'bun:test';
import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';

import { account, user } from '../db/schema';
import { createTestAuth } from '../test/auth';
import {
  EMAIL_CHANGE_NOT_ALLOWED,
  EMAIL_TAKEN,
  IMAGE_NOT_ALLOWED,
  INVALID_EMAIL,
  PASSWORD_PATHS,
} from './create-auth';

type TestAuth = Awaited<ReturnType<typeof createTestAuth>>;

/** A request the way a browser sends it, through the HTTP handler rather than `auth.api`. */
async function post(t: TestAuth, path: string, body: unknown, token?: string) {
  const response = await t.auth.handler(
    new Request(`http://localhost:4000/api/auth${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify(body),
    }),
  );
  const isJson = response.headers.get('content-type')?.includes('json');
  return {
    status: response.status,
    body: isJson ? ((await response.json()) as { code?: string } | null) : null,
  };
}

describe('createAuth', () => {
  test('initialises with Google, VK and Yandex all configured', async () => {
    const { auth } = await createTestAuth({
      google: { clientId: 'g', clientSecret: 'gs' },
      vk: { clientId: 'v', clientSecret: 'vs' },
      yandex: { clientId: 'y', clientSecret: 'ys' },
    });
    await expect(auth.api.getSession({ headers: new Headers() })).resolves.toBeNull();
  });
});

describe('passwords', () => {
  test('every password route is gone', async () => {
    const t = await createTestAuth();
    for (const path of PASSWORD_PATHS) {
      const response = await t.auth.handler(
        new Request(`http://localhost:4000/api/auth${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
          body: '{}',
        }),
      );
      expect({ path, status: response.status }).toEqual({ path, status: 404 });
    }
  });

  test('an old password no longer signs in, by username or by email', async () => {
    const t = await createTestAuth();
    await t.db
      .insert(user)
      .values({ id: 'old', name: 'Old', email: 'alice@test.local', username: 'alice' });
    await t.db.insert(account).values({
      id: 'old-credential',
      userId: 'old',
      accountId: 'old',
      providerId: 'credential',
      password: await hashPassword('hunter22'),
      updatedAt: new Date(),
    });
    const byUsername = await post(t, '/sign-in/username', {
      username: 'alice',
      password: 'hunter22',
    });
    const byEmail = await post(t, '/sign-in/email', {
      email: 'alice@test.local',
      password: 'hunter22',
    });
    expect([byUsername.status, byEmail.status]).toEqual([404, 404]);
  });

  test('a code-only user can not get a password by the reset code', async () => {
    const t = await createTestAuth();
    const { userId } = await t.signIn('bob@test.local');
    const sentBefore = t.sent.length;
    const request = await post(t, '/email-otp/request-password-reset', { email: 'bob@test.local' });
    const reset = await post(t, '/email-otp/reset-password', {
      email: 'bob@test.local',
      otp: '000000',
      password: 'newpassword1',
    });
    expect([request.status, reset.status]).toEqual([404, 404]);
    expect(t.sent).toHaveLength(sentBefore);
    const credentials = await t.db.select().from(account).where(eq(account.userId, userId));
    expect(credentials.map((row) => row.providerId)).not.toContain('credential');
  });
});

describe('placeholder emails', () => {
  test('take no codes', async () => {
    const t = await createTestAuth();
    const send = await post(t, '/email-otp/send-verification-otp', {
      email: 'TG-1@users.invalid',
      type: 'sign-in',
    });
    const signIn = await post(t, '/sign-in/email-otp', {
      email: 'vk-1@users.invalid',
      otp: '123456',
    });
    expect(send).toMatchObject({ status: 400, body: { code: INVALID_EMAIL } });
    expect(signIn).toMatchObject({ status: 400, body: { code: INVALID_EMAIL } });
    expect(t.sent).toHaveLength(0);
  });
});

describe('adding an email', () => {
  /** A Telegram user: a placeholder email, so the profile offers to add a real one. */
  async function telegramUser(t: TestAuth) {
    const { token, userId } = await t.signIn('someone@test.local');
    await t.db
      .update(user)
      .set({ email: 'tg-5@users.invalid', emailVerified: false })
      .where(eq(user.id, userId));
    return { token, userId };
  }

  test('a user without a real email adds one by code', async () => {
    const t = await createTestAuth();
    const { token, userId } = await telegramUser(t);
    const request = await post(
      t,
      '/email-otp/request-email-change',
      { newEmail: 'new@test.local' },
      token,
    );
    expect(request.status).toBe(200);
    const change = await post(
      t,
      '/email-otp/change-email',
      { newEmail: 'new@test.local', otp: t.lastCode() },
      token,
    );
    expect(change.status).toBe(200);
    const [row] = await t.db.select().from(user).where(eq(user.id, userId));
    expect(row).toMatchObject({ email: 'new@test.local', emailVerified: true });
  });

  test('a confirmed real email can not be changed', async () => {
    const t = await createTestAuth();
    const { token } = await t.signIn('a@test.local');
    const request = await post(
      t,
      '/email-otp/request-email-change',
      { newEmail: 'b@test.local' },
      token,
    );
    const change = await post(
      t,
      '/email-otp/change-email',
      { newEmail: 'b@test.local', otp: '123456' },
      token,
    );
    expect(request).toMatchObject({ status: 403, body: { code: EMAIL_CHANGE_NOT_ALLOWED } });
    expect(change).toMatchObject({ status: 403, body: { code: EMAIL_CHANGE_NOT_ALLOWED } });
    expect(t.sent).toHaveLength(1);
  });

  test("another user's email is refused up front", async () => {
    const t = await createTestAuth();
    await t.signIn('taken@test.local');
    const { token } = await telegramUser(t);
    const sentBefore = t.sent.length;
    const request = await post(
      t,
      '/email-otp/request-email-change',
      { newEmail: 'Taken@test.local' },
      token,
    );
    expect(request).toMatchObject({ status: 400, body: { code: EMAIL_TAKEN } });
    expect(t.sent).toHaveLength(sentBefore);
  });

  test('a placeholder is not an email to add', async () => {
    const t = await createTestAuth();
    const { token } = await telegramUser(t);
    const request = await post(
      t,
      '/email-otp/request-email-change',
      { newEmail: 'tg-9@users.invalid' },
      token,
    );
    expect(request).toMatchObject({ status: 400, body: { code: INVALID_EMAIL } });
  });
});

describe('updating the profile', () => {
  test('the avatar can not be set by the client', async () => {
    const t = await createTestAuth();
    const { token, userId } = await t.signIn('a@test.local');
    const withImage = await post(
      t,
      '/update-user',
      { name: 'A', image: 'https://tracker.example/pixel.gif' },
      token,
    );
    expect(withImage).toMatchObject({ status: 400, body: { code: IMAGE_NOT_ALLOWED } });
    const nameOnly = await post(t, '/update-user', { name: 'A' }, token);
    expect(nameOnly.status).toBe(200);
    const [row] = await t.db.select().from(user).where(eq(user.id, userId));
    expect(row).toMatchObject({ name: 'A', image: null });
  });
});
