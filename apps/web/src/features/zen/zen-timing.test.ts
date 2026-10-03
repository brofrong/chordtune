/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse, type Rhythm } from '@chordtune/chord-sheet';

import { zenLines, zenOffset, zenPosition, zenRowGlide } from './zen-timing';

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

  test('alphaTex blocks are lines with a start per beat', () => {
    const lines = zenLines(
      doc('${Am}a\n{start_of_alphatex}\n\\tempo 120\n:8 0.6 0.6 r.4 0.6.2\n{end_of_alphatex}'),
      [],
      60,
    );
    expect(lines[1]).toEqual({
      section: 0,
      line: 1,
      start: 4,
      end: 6,
      chordStarts: [4, 4.25, 4.5, 5],
      chordItems: [0, 1, 2, 3],
    });
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

describe('zenRowGlide', () => {
  const starts = [0, 4, 8];

  test('finds the active row and how far through it playback is', () => {
    expect(zenRowGlide(starts, 12, 0)).toEqual({ index: 0, progress: 0 });
    expect(zenRowGlide(starts, 12, 2)).toEqual({ index: 0, progress: 0.5 });
    expect(zenRowGlide(starts, 12, 4)).toEqual({ index: 1, progress: 0 });
    expect(zenRowGlide(starts, 12, 10)).toEqual({ index: 2, progress: 0.5 });
  });

  test('the last row glides towards the block total, not a further row', () => {
    expect(zenRowGlide(starts, 12, 8)).toEqual({ index: 2, progress: 0 });
    expect(zenRowGlide(starts, 12, 12)).toEqual({ index: 2, progress: 1 });
  });

  test('a single row holds at 0 (no next row or total to glide towards)', () => {
    expect(zenRowGlide([0], 0, 0)).toEqual({ index: 0, progress: 1 });
  });
});
