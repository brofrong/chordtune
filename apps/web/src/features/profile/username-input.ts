// Mirrors RESERVED_USERNAMES in apps/api/src/auth/username.ts for an early hint; the API decides.
const RESERVED = new Set([
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

export function normalizeUsernameInput(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 30);
}

export function usernameProblem(value: string): 'short' | 'reserved' | null {
  if (value.length < 3) {
    return 'short';
  }
  return RESERVED.has(value) ? 'reserved' : null;
}
