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
    expect(authErrorKey({ code: 'EMAIL_TAKEN' })).toBe('emailTaken');
    expect(authErrorKey({ code: 'EMAIL_CHANGE_NOT_ALLOWED' })).toBe('emailChangeNotAllowed');
    expect(authErrorKey({ code: 'INVALID_EMAIL' })).toBe('invalidEmail');
    expect(authErrorKey({ code: 'NOT_SUPPORTED' })).toBe('passkeyNotSupported');
  });

  test('an old session asks to sign in again', () => {
    expect(authErrorKey({ code: 'SESSION_NOT_FRESH', status: 403 })).toBe('reauth');
  });

  test('maps the OAuth redirect errors of linking', () => {
    expect(authErrorKey('unable_to_link_account')).toBe('unableToLink');
    expect(authErrorKey('account_already_linked_to_different_user')).toBe('linkedToAnother');
  });

  test('maps the OAuth redirect error for an existing email', () => {
    expect(authErrorKey('account_not_linked')).toBe('accountNotLinked');
  });

  test('maps a cancelled or refused OAuth consent screen', () => {
    expect(authErrorKey('access_denied')).toBe('providerRefused');
  });

  test('anything else is a generic failure', () => {
    expect(authErrorKey({ code: 'SOMETHING' })).toBe('failed');
    expect(authErrorKey(null)).toBe('failed');
  });
});
