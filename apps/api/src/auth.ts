import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { betterAuth } from 'better-auth';
import { bearer } from 'better-auth/plugins';

import { db } from './db';
import { tables } from './db/schema';
import { env } from './env';

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'pg', schema: tables }),
  trustedOrigins: env.WEB_ORIGINS,
  emailAndPassword: { enabled: true },
  // Capacitor WebViews run on capacitor:// or https://localhost, where third-party cookies to the
  // API are unreliable, so native builds authenticate with a bearer token instead.
  plugins: [bearer()],
});

export type Session = typeof auth.$Infer.Session;
