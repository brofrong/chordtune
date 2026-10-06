/** `a@x.com, B@y.com` → lowercased addresses; empty entries dropped. */
export function parseEmails(value: string): string[] {
  return value
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdmin(email: string | null | undefined, admins: string[]): boolean {
  return Boolean(email) && admins.includes((email ?? '').toLowerCase());
}
