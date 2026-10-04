import { join } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { db } from './index';

/**
 * Brings the database up to the schema this code expects. Entry points call it before importing
 * `auth`, which reads its secret from a table the migrations create.
 */
export function migrateDatabase() {
  return migrate(db, { migrationsFolder: join(import.meta.dir, '../../drizzle') });
}
