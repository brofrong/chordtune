export type AuthErrorKey =
  | 'wrongCode'
  | 'codeExpired'
  | 'tooManyAttempts'
  | 'mailFailed'
  | 'accountNotLinked'
  | 'lastMethod'
  | 'telegramTaken'
  | 'reauth'
  | 'failed';

const BY_CODE: Record<string, AuthErrorKey> = {
  INVALID_OTP: 'wrongCode',
  OTP_EXPIRED: 'codeExpired',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts',
  MAIL_FAILED: 'mailFailed',
  LAST_SIGN_IN_METHOD: 'lastMethod',
  TELEGRAM_ALREADY_LINKED: 'telegramTaken',
  REAUTH_REQUIRED: 'reauth',
  // OAuth redirects back with `?error=account_not_linked` when the email has an account that
  // cannot be joined automatically (e.g. VK, or a former password user who never confirmed it).
  account_not_linked: 'accountNotLinked',
  ACCOUNT_NOT_LINKED: 'accountNotLinked',
};

/** A message key under `auth.errors` for a Better Auth error object or an OAuth `?error=` value. */
export function authErrorKey(
  error: { code?: string; status?: number } | string | null | undefined,
): AuthErrorKey {
  const code = typeof error === 'string' ? error : error?.code;
  return (code && BY_CODE[code]) || 'failed';
}
