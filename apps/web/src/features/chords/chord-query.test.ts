/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { normalizeChordQuery } from './chord-query';

describe('normalizeChordQuery', () => {
  test('uppercases only the first letter', () => {
    expect(normalizeChordQuery('am')).toBe('Am');
    expect(normalizeChordQuery('h')).toBe('H');
    expect(normalizeChordQuery('hm')).toBe('Hm');
    expect(normalizeChordQuery('f#m7')).toBe('F#m7');
  });

  test('leaves the rest of the text as typed, including a phone-cased M7', () => {
    expect(normalizeChordQuery('f#M7')).toBe('F#M7');
    expect(normalizeChordQuery('AM')).toBe('AM');
  });

  test('trims surrounding whitespace', () => {
    expect(normalizeChordQuery('  am  ')).toBe('Am');
  });

  test('empty and whitespace-only input stay empty', () => {
    expect(normalizeChordQuery('')).toBe('');
    expect(normalizeChordQuery('   ')).toBe('');
  });
});
