import { describe, expect, test } from 'bun:test';

import { isAdmin, parseEmails } from './admin';

describe('admins', () => {
  test('the list is comma-separated, trimmed and case-insensitive', () => {
    const admins = parseEmails(' Me@Example.com, other@example.com ,');
    expect(admins).toEqual(['me@example.com', 'other@example.com']);
    expect(isAdmin({ email: 'ME@example.com', emailVerified: true }, admins)).toBe(true);
    expect(isAdmin({ email: 'someone@example.com', emailVerified: true }, admins)).toBe(false);
  });

  test('nobody is an admin without a list or without a session user', () => {
    expect(isAdmin({ email: 'me@example.com', emailVerified: true }, parseEmails(''))).toBe(false);
    expect(isAdmin(undefined, ['me@example.com'])).toBe(false);
  });

  test('an unverified email is never an admin', () => {
    expect(isAdmin({ email: 'me@example.com', emailVerified: false }, ['me@example.com'])).toBe(
      false,
    );
  });
});
