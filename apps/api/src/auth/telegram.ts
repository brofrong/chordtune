import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const TELEGRAM_MAX_AGE_SECONDS = 600;

const loginSchema = z.object({
  id: z.coerce.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.coerce.number().int(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export type TelegramLogin = z.infer<typeof loginSchema>;

/**
 * Checks the Login Widget signature: HMAC-SHA256 of the sorted `key=value` lines, keyed by
 * SHA-256 of the bot token. The check string is built from the raw fields, so fields Telegram
 * adds later still verify.
 */
export function verifyTelegramLogin(
  data: Record<string, unknown>,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): TelegramLogin | null {
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    return null;
  }
  const check = Object.keys(data)
    .filter((key) => key !== 'hash' && data[key] !== undefined && data[key] !== null)
    .sort()
    .map((key) => `${key}=${String(data[key])}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const expected = Buffer.from(createHmac('sha256', secret).update(check).digest('hex'));
  const given = Buffer.from(parsed.data.hash);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  const age = nowSeconds - parsed.data.auth_date;
  return age <= TELEGRAM_MAX_AGE_SECONDS && age >= -60 ? parsed.data : null;
}
