/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse, type Rhythm } from '@chordtune/chord-sheet';

import { zenLines, zenOffset, zenPosition } from './zen-timing';

const doc = (source: string) => parse(source).doc;

describe('zenLines', () => {
  test('lines last as many bars as they have chords', () => {
    // 60 BPM, 4/4 without rhythms: a bar is 4 s.
    const lines = zenLines(doc('${Am}a ${G}b\n${F}c'), [], 60);
    expect(lines).toEqual([
      { section: 0, line: 0, start: 0, end: 8, chordStarts: [0, 4], chordItems: [0, 2] },
      { section: 0, line: 1, start: 8, end: 12, chordStarts: [8], chordItems: [0] },
    ]);
  });

  test('bars and repeats change the length', () => {
    expect(zenLines(doc('|${Am}|${G}|'), [], 60)[0]).toMatchObject({ start: 0, end: 8 });
    expect(zenLines(doc('${Am} ${x2}'), [], 60)[0]).toMatchObject({ start: 0, end: 8 });
  });

  test('text lines and tabs take no time', () => {
    const lines = zenLines(
      doc('[Куплет]\nпросто текст\n${Am}la\n{start_of_tab}\ne|--|\n{end_of_tab}\n${G}la'),
      [],
      60,
    );
    expect(lines.map((l) => [l.line, l.start, l.end])).toEqual([
      [1, 0, 4],
      [3, 4, 8],
    ]);
  });

  test('the rhythm sets the bar length', () => {
    const waltz: Rhythm = {
      key: 'A',
      name: 'w',
      kind: 'strum',
      time: '3/4',
      steps: [{ stroke: 'D' }],
    };
    expect(zenLines(doc('${Am}a'), [waltz], 60)[0]).toMatchObject({ end: 3 });
  });

  test('no chords, no lines', () => {
    expect(zenLines(doc('просто текст'), [], 90)).toEqual([]);
  });
});

describe('zenPosition', () => {
  const lines = zenLines(doc('${Am}a ${G}b\n${F}c'), [], 60);

  test('finds the line, its progress and the current chord', () => {
    expect(zenPosition(lines, 5)).toEqual({ index: 0, progress: 0.625, chord: 1, done: false });
    expect(zenPosition(lines, 0)).toEqual({ index: 0, progress: 0, chord: 0, done: false });
    expect(zenPosition(lines, 9)).toEqual({ index: 1, progress: 0.25, chord: 0, done: false });
  });

  test('past the end is done', () => {
    expect(zenPosition(lines, 12)).toEqual({ index: 1, progress: 1, chord: 0, done: true });
  });
});

describe('zenOffset', () => {
  test('holds the line, then glides in the last 30%', () => {
    expect(zenOffset(0.5)).toBe(0);
    expect(zenOffset(0.7)).toBe(0);
    expect(zenOffset(0.85)).toBeCloseTo(0.5, 9);
    expect(zenOffset(1)).toBe(1);
  });
});
