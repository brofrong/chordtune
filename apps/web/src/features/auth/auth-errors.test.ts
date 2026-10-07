import { describe, expect, test } from 'bun:test';

import { authErrorKey } from './auth-errors';

describe('authErrorKey', () => {
  test('maps Better Auth and our codes', () => {
    expect(authErrorKey({ code: 'INVALID_OTP' })).toBe('wrongCode');
    expect(authErrorKey({ code: 'OTP_EXPIRED' })).toBe('codeExpired');
    expect(authErrorKey({ code: 'TOO_MANY_ATTEMPTS' })).toBe('tooManyAttempts');
    expect(authErrorKey({ code: 'MAIL_FAILED' })).toBe('mailFailed');
    expect(authErrorKey({ code: 'LAST_SIGN_IN_METHOD' })).toBe('lastMethod');
    expect(authErrorKey({ code: 'TELEGRAM_ALREADY_LINKED' })).toBe('telegramTaken');
    expect(authErrorKey({ code: 'REAUTH_REQUIRED' })).toBe('reauth');
  });

  test('maps the OAuth redirect error for an existing email', () => {
    expect(authErrorKey('account_not_linked')).toBe('accountNotLinked');
  });

  test('anything else is a generic failure', () => {
    expect(authErrorKey({ code: 'SOMETHING' })).toBe('failed');
    expect(authErrorKey(null)).toBe('failed');
  });
});
