/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse } from '@chordtune/chord-sheet';

import { zenLines, zenPosition } from './zen-timing';
import { resolveZenMode, rowEmphasis, sectionStrip, seekTime } from './zen-view';

const doc = (source: string) => parse(source).doc;
// 60 BPM, no rhythms: one chord = one 4/4 bar = 4 s.
const SONG = doc(
  '[Куплет]\n${Am}a ${F}b\nпросто текст\n${C}c ${G}d\n[Припев]\n${Em}e ${Em}f ${D}g',
);
const LINES = zenLines(SONG, [], 60);
const at = (time: number) => sectionStrip(SONG, LINES, zenPosition(LINES, time));

describe('resolveZenMode', () => {
  test('listener, then author, then auto by chord count', () => {
    const four = doc('${Am}a ${F}b ${C}c ${G}d ${Am}e');
    const five = doc('${Am}a ${F}b ${C}c ${G}d ${E}e');
    expect(resolveZenMode('inline', 'strip', four)).toBe('inline');
    expect(resolveZenMode(null, 'inline', four)).toBe('inline');
    expect(resolveZenMode(null, null, four)).toBe('strip');
    expect(resolveZenMode(null, null, five)).toBe('inline');
  });
});

describe('rowEmphasis', () => {
  test('by distance from the current row', () => {
    expect([3, 4, 5, 6, 9, 2].map((row) => rowEmphasis(row, 3))).toEqual([
      'current',
      'next',
      'after',
      'later',
      'later',
      'past',
    ]);
  });
});

describe('sectionStrip', () => {
  test('the section chords in order, the sounding one and the next different one', () => {
    expect(at(0)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 0, next: 1 });
    expect(at(4)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 1, next: 2 });
  });

  test('no ring when the next chord is outside the strip', () => {
    expect(at(12)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 3, next: null });
  });

  test('a repeated chord rings the next different one', () => {
    expect(at(16)).toEqual({ chords: ['Em', 'D'], current: 0, next: 1 });
  });
});

describe('seekTime', () => {
  // `parse` drops the empty section before the first header: «Куплет» is section 0.
  test('a line starts at its first chord, a chord at itself', () => {
    expect(seekTime(LINES, 0, 0)).toBe(0);
    expect(seekTime(LINES, 0, 0, 2)).toBe(4);
    expect(seekTime(LINES, 0, 2, 0)).toBe(8);
  });

  test('an untimed line starts at the next timed line; past the end there is nothing', () => {
    expect(seekTime(LINES, 0, 1)).toBe(8);
    expect(seekTime(LINES, 1, 5)).toBeNull();
  });
});
