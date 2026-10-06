import { and, eq, ne } from 'drizzle-orm';

import type { Database } from '../db';
import { account, passkey, user } from '../db/schema';
import { isPlaceholderEmail } from './placeholder-email';

export const LAST_SIGN_IN_METHOD = 'LAST_SIGN_IN_METHOD';

/** Ways a user can still get in: linked providers, passkeys and a real verified email. */
export async function signInMethodCount(db: Database, userId: string): Promise<number> {
  const [providers, passkeys, [owner]] = await Promise.all([
    // `credential` rows are passwords from before; they no longer sign anyone in.
    db.$count(account, and(eq(account.userId, userId), ne(account.providerId, 'credential'))),
    db.$count(passkey, eq(passkey.userId, userId)),
    db
      .select({ email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId)),
  ]);
  const email = owner?.emailVerified && !isPlaceholderEmail(owner.email) ? 1 : 0;
  return providers + passkeys + email;
}
