export const REAUTH_REQUIRED = 'REAUTH_REQUIRED';
export const RECENT_SIGN_IN_MINUTES = 10;

/** Deleting an account needs a sign-in from the last few minutes, not a forgotten old session. */
export function isRecentSignIn(sessionCreatedAt: Date, now = new Date()) {
  return now.getTime() - sessionCreatedAt.getTime() <= RECENT_SIGN_IN_MINUTES * 60_000;
}
