import type { BetterAuthPlugin } from 'better-auth';
import { eq, isNull, like, or } from 'drizzle-orm';

import type { Database } from '../db';
import { user } from '../db/schema';
import { toLatin } from '../lib/translit';
import { isPlaceholderEmail } from './placeholder-email';

const MIN = 3;
const MAX = 30;

/** Path segments and words that would read as official if someone took them. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'api',
  'app',
  'auth',
  'chordtune',
  'edit',
  'help',
  'login',
  'logout',
  'me',
  'moderator',
  'new',
  'null',
  'profile',
  'root',
  'security',
  'settings',
  'signin',
  'signup',
  'support',
  'system',
  'u',
  'undefined',
  'user',
  'users',
]);

export function isValidUsername(value: string) {
  return /^[a-z0-9_]{3,30}$/.test(value) && !RESERVED_USERNAMES.has(value);
}

function clean(value: string) {
  return toLatin(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX)
    .replace(/_+$/, '');
}

/** A valid starting point for a username; `uniqueUsername` resolves collisions. */
export function usernameBase(candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    let base = candidate ? clean(candidate) : '';
    if (!base) {
      continue;
    }
    if (base.length < MIN) {
      base = `${base}${Math.floor(Math.random() * 900 + 100)}`.slice(0, MAX);
    }
    if (RESERVED_USERNAMES.has(base)) {
      base = `${base}_${Math.floor(Math.random() * 90 + 10)}`;
    }
    return base;
  }
  return 'user';
}

/** `base`, or `base2`, `base3`… whichever is free. Suffixes may push past 30 characters, so trim first. */
export async function uniqueUsername(db: Database, base: string): Promise<string> {
  const taken = new Set(
    (
      await db
        .select({ username: user.username })
        .from(user)
        .where(or(eq(user.username, base), like(user.username, `${base}%`)))
    ).map((row) => row.username),
  );
  if (!taken.has(base) && base !== 'user') {
    return base;
  }
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const candidate = `${base.slice(0, MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** Where a new user's username comes from, best first. */
export function usernameHints(data: { email: string; name: string; username?: string | null }) {
  const local = isPlaceholderEmail(data.email) ? null : data.email.split('@')[0];
  return [data.username, local, data.name].filter((value): value is string => Boolean(value));
}

/**
 * Assigns a clean, unique username to every new user.
 *
 * Better Auth runs plugin-contributed `databaseHooks` (built from each plugin's `init()`, in
 * `plugins` array order) before the root-level `databaseHooks` option — see
 * `better-auth/dist/context/helpers.mjs` (`runPluginInit`, which pushes plugin hooks first and
 * `options.databaseHooks` last) and `better-auth/dist/db/with-hooks.mjs` (`createWithHooks`,
 * which runs them in that order). The `username` plugin's own `create.before` hook validates and
 * uniqueness-checks whatever raw `username` hint already sits on the data (e.g. a Telegram
 * display name), and throws if it isn't already a clean, free value. So this has to be a plugin
 * registered *before* `username(...)` in the `plugins` array, not a root-level `databaseHooks`
 * entry (which would run after and arrive too late to clean the hint first).
 */
export function usernameGenerator(db: Database): BetterAuthPlugin {
  return {
    id: 'username-generator',
    init: () => ({
      options: {
        databaseHooks: {
          user: {
            create: {
              before: async (data) => ({
                data: {
                  ...data,
                  username: await uniqueUsername(db, usernameBase(usernameHints(data))),
                },
              }),
            },
          },
        },
      },
    }),
  };
}

/** Gives a username to users created before usernames existed. Safe to run on every start. */
export async function backfillUsernames(db: Database): Promise<number> {
  const missing = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(isNull(user.username));
  for (const row of missing) {
    const username = await uniqueUsername(db, usernameBase(usernameHints(row)));
    await db.update(user).set({ username }).where(eq(user.id, row.id));
  }
  return missing.length;
}
