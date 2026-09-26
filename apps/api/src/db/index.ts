import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../env';
import { relations } from './schema';

const client = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle({ client, relations });

/** Any Postgres driver with our relations: postgres-js in the app, PGlite in tests. */
export type Database = PgAsyncDatabase<PgQueryResultHKT, typeof relations>;
