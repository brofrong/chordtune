/** Splits an OAuth `?error=` (and its `error_description`) off a query string. */
export function splitOAuthError(search: string): { error: string | null; search: string } {
  const params = new URLSearchParams(search);
  const error = params.get('error');
  params.delete('error');
  params.delete('error_description');
  const rest = params.toString();
  return { error, search: rest ? `?${rest}` : '' };
}

/** Reads the OAuth error this page was sent back with, once: it's dropped from the address. */
export function takeOAuthError(): string | null {
  const { error, search } = splitOAuthError(window.location.search);
  if (error) {
    window.history.replaceState(null, '', `${window.location.pathname}${search}`);
  }
  return error;
}

/**
 * Linking from «Безопасность» comes back to that page, which reports its own errors: the global
 * handler must not open the sign-in sheet for a user who is signed in. Matches the web route and
 * the static export's `/profile/security/` or `.html`.
 */
export function isSecurityPath(pathname: string): boolean {
  return /\/profile\/security(\/|\.html)?$/.test(pathname);
}
