import { describe, expect, test } from 'bun:test';

import { chordTones, parseChord } from './chord';

describe('parseChord', () => {
  test('root, suffix and bass', () => {
    expect(parseChord('F#m7/C#')).toEqual({ raw: 'F#m7/C#', root: 'F#', suffix: 'm7', bass: 'C#' });
    expect(parseChord('A#')).toEqual({ raw: 'A#', root: 'A#', suffix: '', bass: null });
    expect(parseChord('Bb7b9')?.suffix).toBe('7b9');
  });

  test('German H is B', () => {
    expect(parseChord('Hm')).toMatchObject({ root: 'B', suffix: 'm' });
    expect(parseChord('H7')?.root).toBe('B');
  });

  test('rejects words and markers', () => {
    for (const raw of ['Куплет', 'x4', 'Am,', 'hello', 'Cmx', '|', '@A', '', 'A/Q']) {
      expect(parseChord(raw)).toBeNull();
    }
  });
});

describe('chordTones', () => {
  const tones = (raw: string) => chordTones(parseChord(raw)!);

  test('triads', () => {
    expect(tones('C')).toEqual({ root: 0, bass: null, intervals: [0, 4, 7] });
    expect(tones('Am').intervals).toEqual([0, 3, 7]);
    expect(tones('Bdim').intervals).toEqual([0, 3, 6]);
    expect(tones('Caug').intervals).toEqual([0, 4, 8]);
    expect(tones('C+').intervals).toEqual([0, 4, 8]);
    expect(tones('Asus4').intervals).toEqual([0, 5, 7]);
    expect(tones('Dsus2').intervals).toEqual([0, 2, 7]);
    expect(tones('G5').intervals).toEqual([0, 7]);
  });

  test('sevenths and extensions', () => {
    expect(tones('A7').intervals).toEqual([0, 4, 7, 10]);
    expect(tones('Cmaj7').intervals).toEqual([0, 4, 7, 11]);
    expect(tones('Am7').intervals).toEqual([0, 3, 7, 10]);
    expect(tones('Bm7b5').intervals).toEqual([0, 3, 6, 10]);
    expect(tones('Bdim7').intervals).toEqual([0, 3, 6, 9]);
    expect(tones('E6').intervals).toEqual([0, 4, 7, 9]);
    expect(tones('Am6').intervals).toEqual([0, 3, 7, 9]);
    expect(tones('Cadd9').intervals).toEqual([0, 2, 4, 7]);
    expect(tones('E9').intervals).toEqual([0, 2, 4, 7, 10]);
    expect(tones('A7sus4').intervals).toEqual([0, 5, 7, 10]);
  });

  test('slash bass and flats', () => {
    expect(tones('D/F#')).toEqual({ root: 2, bass: 6, intervals: [0, 4, 7] });
    expect(tones('Bb').root).toBe(10);
    expect(tones('C#m').root).toBe(1);
  });
});
