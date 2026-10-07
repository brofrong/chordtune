import { describe, expect, test } from 'bun:test';

import { isSecurityPath, splitOAuthError } from './oauth-error';

describe('splitOAuthError', () => {
  test('takes the error and its description, keeps the rest', () => {
    expect(splitOAuthError('?a=1&error=unable_to_link_account&error_description=x')).toEqual({
      error: 'unable_to_link_account',
      search: '?a=1',
    });
    expect(splitOAuthError('?error=access_denied')).toEqual({ error: 'access_denied', search: '' });
  });

  test('no error, nothing changes', () => {
    expect(splitOAuthError('?a=1')).toEqual({ error: null, search: '?a=1' });
    expect(splitOAuthError('')).toEqual({ error: null, search: '' });
  });
});

describe('isSecurityPath', () => {
  test('the security page in both builds', () => {
    expect(isSecurityPath('/ru/profile/security')).toBe(true);
    expect(isSecurityPath('/en/profile/security/')).toBe(true);
    expect(isSecurityPath('/ru/profile/security.html')).toBe(true);
  });

  test('other pages', () => {
    expect(isSecurityPath('/ru/profile')).toBe(false);
    expect(isSecurityPath('/ru/profile/security/x')).toBe(false);
    expect(isSecurityPath('/ru/songs/1')).toBe(false);
  });
});
