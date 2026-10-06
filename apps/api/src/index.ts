import { migrateDatabase } from './db/migrate';
import { env } from './env';

// Bring the database up to the schema this code expects before serving any request.
await migrateDatabase();

// Users from before usernames get theirs once; later starts find nothing to do.
const { backfillUsernames } = await import('./auth/username');
const { db } = await import('./db');
await backfillUsernames(db);

// Imported only now: loading the app reads the auth secret from a table the migrations create.
const { app } = await import('./app');

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
