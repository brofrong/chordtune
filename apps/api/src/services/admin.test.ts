import { describe, expect, test } from 'bun:test';

import { isAdmin, parseEmails } from './admin';

describe('admins', () => {
  test('the list is comma-separated, trimmed and case-insensitive', () => {
    const admins = parseEmails(' Me@Example.com, other@example.com ,');
    expect(admins).toEqual(['me@example.com', 'other@example.com']);
    expect(isAdmin('ME@example.com', admins)).toBe(true);
    expect(isAdmin('someone@example.com', admins)).toBe(false);
  });

  test('nobody is an admin without a list or without an email', () => {
    expect(isAdmin('me@example.com', parseEmails(''))).toBe(false);
    expect(isAdmin(undefined, ['me@example.com'])).toBe(false);
  });
});
