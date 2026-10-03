import { describe, expect, test } from 'bun:test';

import { isZenMode } from './display';
import { chordKey, isShape, sanitizeVoicings, shapeMidis } from './shape';

describe('chordKey', () => {
  test('normalises like chordList', () => {
    expect(chordKey('Hm')).toBe('Bm');
    expect(chordKey('F#m7/C#')).toBe('F#m7/C#');
    expect(chordKey('Куплет')).toBeNull();
  });
});

describe('isShape', () => {
  test('frets per string, 0–24 or null, something sounds', () => {
    expect(isShape([null, 0, 2, 2, 1, 0], 6)).toBe(true);
    expect(isShape([null, 0, 2, 2, 1], 6)).toBe(false);
    expect(isShape([null, 0, 2, 2, 1, 25], 6)).toBe(false);
    expect(isShape([null, 0, 2, 2, 1, 1.5], 6)).toBe(false);
    expect(isShape([null, null, null, null, null, null], 6)).toBe(false);
    expect(isShape('x02210', 6)).toBe(false);
  });
});

describe('sanitizeVoicings', () => {
  test('keeps normalised chords with valid shapes', () => {
    expect(
      sanitizeVoicings(
        {
          Am: [null, 0, 2, 2, 1, 0],
          Hm: [null, 2, 4, 4, 3, 2],
          F: [1, 3, 3],
          Нет: [0, 0, 0, 0, 0, 0],
        },
        6,
      ),
    ).toEqual({ Am: [null, 0, 2, 2, 1, 0] });
    expect(sanitizeVoicings(null, 6)).toEqual({});
    expect(sanitizeVoicings([[0]], 6)).toEqual({});
  });
});

describe('shapeMidis', () => {
  test('sounding strings, thickest first, plus capo', () => {
    expect(shapeMidis([null, 0, 2, 2, 1, 0], [40, 45, 50, 55, 59, 64])).toEqual([
      45, 52, 57, 60, 64,
    ]);
    expect(shapeMidis([0, null, null, null, null, null], [40, 45, 50, 55, 59, 64], 3)).toEqual([
      43,
    ]);
  });
});

describe('isZenMode', () => {
  test('inline and strip', () => {
    expect(isZenMode('inline')).toBe(true);
    expect(isZenMode('strip')).toBe(true);
    expect(isZenMode('auto')).toBe(false);
    expect(isZenMode(null)).toBe(false);
  });
});
