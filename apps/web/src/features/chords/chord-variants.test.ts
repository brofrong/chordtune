/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { GUITAR_TUNINGS } from '@chordtune/chord-sheet';

import { chordVariants } from './chord-variants';
import { readPanelOpen } from './use-chord-panel';

const STANDARD = GUITAR_TUNINGS.standard;

describe('chordVariants', () => {
  test('suggested shapes, catalog first', () => {
    const shapes = chordVariants('Am', STANDARD);
    expect(shapes[0]).toEqual([null, 0, 2, 2, 1, 0]);
    expect(shapes.length).toBeGreaterThan(1);
  });

  test("the author's shape leads and is not repeated", () => {
    const own = [5, 7, 7, 5, 5, 5];
    const shapes = chordVariants('Am', STANDARD, own);
    expect(shapes[0]).toEqual(own);
    expect(shapes.filter((shape) => shape.join() === own.join())).toHaveLength(1);
    const catalog = chordVariants('Am', STANDARD, [null, 0, 2, 2, 1, 0]);
    expect(catalog.filter((shape) => shape.join() === ',0,2,2,1,0')).toHaveLength(1);
  });

  test('not a chord: nothing', () => {
    expect(chordVariants('Куплет', STANDARD)).toEqual([]);
  });
});

describe('readPanelOpen', () => {
  test('open unless hidden', () => {
    expect(readPanelOpen(null)).toBe(true);
    expect(readPanelOpen('open')).toBe(true);
    expect(readPanelOpen('hidden')).toBe(false);
    expect(readPanelOpen('garbage')).toBe(true);
  });
});
