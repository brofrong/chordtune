import { describe, expect, test } from 'bun:test';
import { createHash, createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { account, user } from '../db/schema';
import { createTestAuth } from '../test/auth';
import { verifyTelegramLogin } from './telegram';

const BOT = '123456:test-token';

/** Signs widget fields the way Telegram documents it, independently of the code under test. */
function sign(fields: Record<string, string | number>, botToken = BOT) {
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  return { ...fields, hash: createHmac('sha256', secret).update(check).digest('hex') };
}

const now = () => Math.floor(Date.now() / 1000);

describe('verifyTelegramLogin', () => {
  const fields = { id: 42, first_name: 'Вася', username: 'vasya_tg', auth_date: 1_700_000_000 };

  test('accepts a fresh signed login', () => {
    expect(verifyTelegramLogin(sign(fields), BOT, 1_700_000_100)).toMatchObject({ id: 42 });
  });

  test('accepts query-string values (redirect mode sends strings)', () => {
    const signed = sign(fields);
    const asStrings = Object.fromEntries(Object.entries(signed).map(([k, v]) => [k, String(v)]));
    expect(verifyTelegramLogin(asStrings, BOT, 1_700_000_100)).toMatchObject({ id: 42 });
  });

  test('rejects a forged, re-signed or stale login', () => {
    expect(verifyTelegramLogin({ ...sign(fields), id: 43 }, BOT, 1_700_000_100)).toBeNull();
    expect(verifyTelegramLogin(sign(fields, '1:other'), BOT, 1_700_000_100)).toBeNull();
    expect(verifyTelegramLogin(sign(fields), BOT, 1_700_000_000 + 601)).toBeNull();
    expect(verifyTelegramLogin({ id: 42 }, BOT, 1_700_000_100)).toBeNull();
  });
});

describe('telegram plugin', () => {
  test('first sign-in creates a user without a real email; the next finds it', async () => {
    const t = await createTestAuth({
      telegram: { botToken: BOT, botName: 'bot', botId: '123456' },
    });
    const body = sign({ id: 42, first_name: 'Вася', username: 'Vasya_TG', auth_date: now() });
    const first = await t.auth.api.signInTelegram({ body });
    const second = await t.auth.api.signInTelegram({ body });
    expect(second.user.id).toBe(first.user.id);
    const [row] = await t.db.select().from(user).where(eq(user.id, first.user.id));
    expect(row).toMatchObject({ email: 'tg-42@users.invalid', name: 'Вася', username: 'vasya_tg' });
  });

  test('linking attaches Telegram to the signed-in user, once', async () => {
    const t = await createTestAuth({
      telegram: { botToken: BOT, botName: 'bot', botId: '123456' },
    });
    const alice = await t.signIn('alice@test.local');
    const bob = await t.signIn('bob@test.local');
    const body = sign({ id: 7, first_name: 'A', auth_date: now() });

    await t.auth.api.linkTelegram({ body, headers: alice.headers });
    const linked = await t.db.select().from(account).where(eq(account.providerId, 'telegram'));
    expect(linked.map((row) => row.userId)).toEqual([alice.userId]);

    await expect(t.auth.api.linkTelegram({ body, headers: bob.headers })).rejects.toThrow();
    const signedIn = await t.auth.api.signInTelegram({ body });
    expect(signedIn.user.id).toBe(alice.userId);
  });
});
