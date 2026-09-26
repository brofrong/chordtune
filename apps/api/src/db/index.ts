import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../env';
import { relations } from './schema';

const client = postgres(env.DATABASE_URL, { max: 10 });

export const db = drizzle({ client, relations });

export type Database = typeof db;
