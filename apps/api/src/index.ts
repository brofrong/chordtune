import { join } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { app } from './app';
import { db } from './db';
import { env } from './env';

// Bring the database up to the schema this code expects before serving any request.
await migrate(db, { migrationsFolder: join(import.meta.dir, '../drizzle') });

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
