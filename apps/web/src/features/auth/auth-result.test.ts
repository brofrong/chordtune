import { describe, expect, test } from 'bun:test';

import { AuthRequestError, isReauthError, retryUnlessReauth, unwrap } from './auth-result';

describe('unwrap', () => {
  test('returns the data', async () => {
    await expect(unwrap(Promise.resolve({ data: [1], error: null }))).resolves.toEqual([1]);
  });

  test('throws the error with its code', async () => {
    const failure = { code: 'SESSION_NOT_FRESH', status: 403, message: 'Session is not fresh' };
    const thrown = await unwrap(Promise.resolve({ data: null, error: failure })).catch((e) => e);
    expect(thrown).toBeInstanceOf(AuthRequestError);
    expect(thrown).toMatchObject({ code: 'SESSION_NOT_FRESH', status: 403 });
  });
});

describe('reauth errors', () => {
  test('an old session needs a new sign-in and is not retried', () => {
    const stale = new AuthRequestError({ code: 'SESSION_NOT_FRESH', status: 403 });
    expect(isReauthError(stale)).toBe(true);
    expect(retryUnlessReauth(0, stale)).toBe(false);
  });

  test('other failures retry three times', () => {
    const failure = new AuthRequestError({ status: 500 });
    expect(isReauthError(failure)).toBe(false);
    expect(isReauthError(null)).toBe(false);
    expect(retryUnlessReauth(2, failure)).toBe(true);
    expect(retryUnlessReauth(3, failure)).toBe(false);
  });
});
