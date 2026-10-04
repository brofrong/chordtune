import { migrateDatabase } from './db/migrate';
import { env } from './env';

// Bring the database up to the schema this code expects before serving any request.
await migrateDatabase();

// Imported only now: loading the app reads the auth secret from a table the migrations create.
const { app } = await import('./app');

export default {
  port: env.API_PORT,
  fetch: app.fetch,
};
