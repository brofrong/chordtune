/**
 * A session fetch that came back empty for the stored token means the token is dead (revoked or
 * expired). On the web it is worse than useless: the bearer header wins over the cookie, so a
 * dead token hides the fresh cookie session an OAuth redirect has just set. Only the token the
 * request actually sent is judged: one stored while the request was in flight (a sign-in that
 * just finished) is new and must be kept.
 */
export function isStaleToken({
  url,
  data,
  sentAuthorization,
  storedToken,
}: {
  url: string | URL;
  data: unknown;
  sentAuthorization: string | null;
  storedToken: string | null;
}): boolean {
  if (!storedToken || data != null || sentAuthorization !== `Bearer ${storedToken}`) {
    return false;
  }
  return new URL(String(url), 'http://localhost').pathname.endsWith('/get-session');
}
