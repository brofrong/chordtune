/** `a@x.com, B@y.com` → lowercased addresses; empty entries dropped. */
export function parseEmails(value: string): string[] {
  return value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export type AdminCandidate = { email: string; emailVerified: boolean } | null | undefined;

/** An admin needs a verified email: an unverified address could belong to anyone. */
export function isAdmin(user: AdminCandidate, admins: string[]): boolean {
  return Boolean(user?.emailVerified) && admins.includes(user?.email.toLowerCase() ?? '');
}
