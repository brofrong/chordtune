import { describe, expect, test } from 'bun:test';

import { profileHrefFor } from './links';

describe('profileHrefFor', () => {
  test('web gets a path, Capacitor a query', () => {
    expect(profileHrefFor('vasya', false)).toBe('/u/vasya');
    expect(profileHrefFor('vasya', true)).toEqual({ pathname: '/u', query: { name: 'vasya' } });
  });
});
