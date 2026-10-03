/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parseAlphaTex } from '@chordtune/chord-sheet';

import { beamGroups, layoutTab, tabBeatQuarters } from './tab-layout';

const block = (source: string) => parseAlphaTex(source.split('\n')).block;

describe('layoutTab', () => {
  test('beat width follows the duration, with a minimum', () => {
    // Half: 72; sixteenths: 9 → 18 each; bar: 10 + 72 + 8 × 18 + 10.
    const [row] = layoutTab(block('0.6.2 :16 0.6 0.6 0.6 0.6 0.6 0.6 0.6 0.6'), 1000);
    expect(row?.width).toBe(236);
    expect(row?.beats.slice(0, 2).map((b) => [b.x, b.width, b.at])).toEqual([
      [46, 72, 0],
      [91, 18, 2],
    ]);
  });

  test('bars wrap into rows of the given width', () => {
    // A whole note bar is 10 + 144 + 10 = 164.
    const rows = layoutTab(block('0.6.1 | 0.6.1 | 0.6.1'), 350);
    expect(rows.map((r) => r.bars.map((b) => [b.index, b.x]))).toEqual([
      [
        [0, 0],
        [1, 164],
      ],
      [[2, 0]],
    ]);
  });

  test('a bar wider than the row gets a row of its own', () => {
    expect(layoutTab(block('0.6.1 | 0.6.1'), 100)).toHaveLength(2);
  });

  test('empty block has no rows', () => {
    expect(layoutTab(block(''), 300)).toEqual([]);
  });
});

describe('tabBeatQuarters', () => {
  test('sums quarters up to a bar/beat, as drawn (repeats do not change it)', () => {
    const tab = block('\\ro 0.6.1 | 0.6 0.6 0.6 0.6 \\rc 2');
    expect(tabBeatQuarters(tab, 0, 0)).toBe(0);
    expect(tabBeatQuarters(tab, 1, 0)).toBe(4);
    expect(tabBeatQuarters(tab, 1, 2)).toBe(6);
  });
});

describe('beamGroups', () => {
  test('eighths and shorter share a beam within a quarter', () => {
    const tab = block(':8 0.6 0.6 0.6 r 0.6.4 :16 0.6 0.6 0.6 0.6');
    const [row] = layoutTab(tab, 1000);
    if (!row) {
      throw new Error('expected a row');
    }
    expect(beamGroups(tab, row).map((group) => group.map((b) => b.beat))).toEqual([
      [0, 1],
      [5, 6, 7, 8],
    ]);
  });
});
