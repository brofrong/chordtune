export type AuthErrorKey =
  | 'wrongCode'
  | 'codeExpired'
  | 'tooManyAttempts'
  | 'mailFailed'
  | 'accountNotLinked'
  | 'lastMethod'
  | 'telegramTaken'
  | 'reauth'
  | 'providerRefused'
  | 'emailTaken'
  | 'emailChangeNotAllowed'
  | 'invalidEmail'
  | 'passkeyNotSupported'
  | 'unableToLink'
  | 'linkedToAnother'
  | 'failed';

const BY_CODE: Record<string, AuthErrorKey> = {
  INVALID_OTP: 'wrongCode',
  OTP_EXPIRED: 'codeExpired',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts',
  MAIL_FAILED: 'mailFailed',
  LAST_SIGN_IN_METHOD: 'lastMethod',
  TELEGRAM_ALREADY_LINKED: 'telegramTaken',
  REAUTH_REQUIRED: 'reauth',
  // Better Auth wants a sign-in from the last day to list sessions, unlink or add a passkey.
  SESSION_NOT_FRESH: 'reauth',
  EMAIL_TAKEN: 'emailTaken',
  EMAIL_CHANGE_NOT_ALLOWED: 'emailChangeNotAllowed',
  INVALID_EMAIL: 'invalidEmail',
  NOT_SUPPORTED: 'passkeyNotSupported',
  // OAuth redirects back with `?error=account_not_linked` when the email has an account that
  // cannot be joined automatically (e.g. VK, or a former password user who never confirmed it).
  account_not_linked: 'accountNotLinked',
  // The provider itself sends this back (callback.mjs) when the user cancels its consent screen.
  access_denied: 'providerRefused',
  // Linking from the profile comes back with these (oauth2/link-account.mjs).
  unable_to_link_account: 'unableToLink',
  account_already_linked_to_different_user: 'linkedToAnother',
};

/** A message key under `auth.errors` for a Better Auth error object or an OAuth `?error=` value. */
export function authErrorKey(
  error: { code?: string; status?: number } | string | null | undefined,
): AuthErrorKey {
  const code = typeof error === 'string' ? error : error?.code;
  return (code && BY_CODE[code]) || 'failed';
}
