/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { GUITAR_TUNINGS } from '@chordtune/chord-sheet';

import { checkShape } from './shape-check';

const STANDARD = GUITAR_TUNINGS.standard;

describe('checkShape', () => {
  test('the drawn shape plays the chord', () => {
    expect(checkShape([null, 0, 2, 2, 1, 0], 'Am', STANDARD)).toEqual({ kind: 'match' });
    expect(checkShape([null, 2, 4, 4, 3, 2], 'Hm', STANDARD)).toEqual({ kind: 'match' });
  });

  test('another chord: say which', () => {
    expect(checkShape([null, 0, 2, 2, 2, 0], 'Am', STANDARD)).toEqual({ kind: 'other', name: 'A' });
  });

  test('nothing known, nothing pressed', () => {
    expect(checkShape([0, 1, null, null, null, null], 'Am', STANDARD)).toEqual({ kind: 'unknown' });
    expect(checkShape([null, null, null, null, null, null], 'Am', STANDARD)).toEqual({
      kind: 'empty',
    });
  });
});
