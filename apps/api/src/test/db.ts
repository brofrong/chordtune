import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import type { Database } from '../db';
import { relations, user } from '../db/schema';

/** A fresh in-memory Postgres with all migrations applied. */
export async function createTestDb(): Promise<Database> {
  const db = drizzle({ client: new PGlite(), relations });
  await migrate(db, { migrationsFolder: join(import.meta.dir, '../../drizzle') });
  return db;
}

export async function createUser(db: Database, id: string) {
  await db.insert(user).values({ id, name: id, email: `${id}@test.local` });
  return id;
}
