import { describe, expect, test } from 'bun:test';
import { GUITAR_TUNINGS, parse } from '@chordtune/chord-sheet';

import { capoHints } from './capo-hints';

const STANDARD = GUITAR_TUNINGS.standard;

describe('capoHints', () => {
  test('F C Dm without a capo: the 5th fret (C G Am) is easiest and has no barre', () => {
    const hints = capoHints(parse('${F}a ${C}b ${Dm}c').doc, STANDARD, 0);
    expect(hints.map((hint) => hint.capo)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const starred = hints.filter((hint) => hint.star).map((hint) => hint.capo);
    expect(starred).toContain(5);
    expect(starred.length).toBeLessThanOrEqual(2);
    expect(hints[5]?.noBarre).toBe(true);
    expect(hints[3]?.noBarre).toBe(false); // D A Bm — Bm is a barre
    expect(hints[0]?.noBarre).toBe(false); // F is a barre
  });

  test('relative to the author capo', () => {
    // Written as C G Am with capo 5: fret 5 is the same easy shapes.
    const hints = capoHints(parse('${C}a ${G}b ${Am}c').doc, STANDARD, 5);
    expect(hints[5]?.star).toBe(true);
    expect(hints[5]?.noBarre).toBe(true);
  });

  test('a song without chords: no stars', () => {
    expect(capoHints(parse('просто текст').doc, STANDARD, 0).some((hint) => hint.star)).toBe(false);
  });
});
