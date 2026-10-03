import { describe, expect, test } from 'bun:test';

import { parse } from './parse';
import { spellingOf, transposeChord } from './transpose';

const SHARP = { accidental: 'sharp', germanH: false } as const;
const FLAT = { accidental: 'flat', germanH: false } as const;

describe('transposeChord', () => {
  test('root and bass move, the suffix stays', () => {
    expect(transposeChord('F', -3, SHARP)).toBe('D');
    expect(transposeChord('F#m7/C#', -3, SHARP)).toBe('D#m7/A#');
    expect(transposeChord('F#m7/C#', -3, FLAT)).toBe('Ebm7/Bb');
    expect(transposeChord('Am', 14, SHARP)).toBe('Bm');
    expect(transposeChord('C', -13, FLAT)).toBe('B');
  });

  test('German H', () => {
    expect(transposeChord('Hm', 0, { accidental: 'sharp', germanH: true })).toBe('Hm');
    expect(transposeChord('Am', 2, { accidental: 'sharp', germanH: true })).toBe('Hm');
    expect(transposeChord('C', -2, { accidental: 'flat', germanH: true })).toBe('Bb');
  });

  test('not a chord', () => {
    expect(transposeChord('Куплет', 3, SHARP)).toBe('Куплет');
  });
});

describe('spellingOf', () => {
  test('flats when the author writes more flats', () => {
    expect(spellingOf(parse('${Bb}a ${Eb}b ${F#}c').doc)).toEqual({
      accidental: 'flat',
      germanH: false,
    });
    expect(spellingOf(parse('${C#}a ${F#}b ${Bb}c').doc)).toEqual({
      accidental: 'sharp',
      germanH: false,
    });
    expect(spellingOf(parse('${C}a').doc)).toEqual({ accidental: 'sharp', germanH: false });
  });

  test('H anywhere keeps H', () => {
    expect(spellingOf(parse('${Hm}a ${A/H}b').doc).germanH).toBe(true);
  });
});
