/**
 * A session fetch that came back empty while a token is stored means the token is dead (revoked
 * or expired). On the web it is worse than useless: the bearer header wins over the cookie, so a
 * dead token hides the fresh cookie session an OAuth redirect has just set.
 */
export function isStaleToken({
  url,
  data,
  storedToken,
}: {
  url: string | URL;
  data: unknown;
  storedToken: string | null;
}): boolean {
  if (!storedToken || data != null) {
    return false;
  }
  return new URL(String(url), 'http://localhost').pathname.endsWith('/get-session');
}
