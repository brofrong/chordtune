import { eq } from 'drizzle-orm';

import type { Database } from './db';
import { appConfig } from './db/schema';

export async function getConfig<T>(db: Database, key: string): Promise<T | null> {
  const [row] = await db
    .select({ value: appConfig.value })
    .from(appConfig)
    .where(eq(appConfig.key, key));
  return row ? (row.value as T) : null;
}

export async function setConfig<T>(db: Database, key: string, value: T): Promise<void> {
  await db
    .insert(appConfig)
    .values({ key, value })
    .onConflictDoUpdate({ target: appConfig.key, set: { value, updatedAt: new Date() } });
}

/**
 * Returns the stored value, creating it on first use. Inserting with `on conflict do nothing`
 * means instances starting at the same time all end up with whichever value landed first.
 */
export async function getOrCreateConfig<T>(db: Database, key: string, create: () => T): Promise<T> {
  const stored = await getConfig<T>(db, key);
  if (stored != null) {
    return stored;
  }
  const [inserted] = await db
    .insert(appConfig)
    .values({ key, value: create() })
    .onConflictDoNothing()
    .returning({ value: appConfig.value });
  if (inserted) {
    return inserted.value as T;
  }
  const existing = await getConfig<T>(db, key);
  if (existing == null) {
    throw new Error(`Config "${key}" vanished right after it was created`);
  }
  return existing;
}

/** Better Auth's signing secret: generated on first start and shared by every instance after. */
export function authSecret(db: Database): Promise<string> {
  return getOrCreateConfig(db, 'BETTER_AUTH_SECRET', () =>
    Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex'),
  );
}
