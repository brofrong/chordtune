import { describe, expect, test } from 'bun:test';

import { joinLine, splitLine } from './line';
import type { Item } from './types';

const items: Item[] = [
  { type: 'bar' },
  { type: 'chord', chord: 'Am' },
  { type: 'text', text: 'Зачем ' },
  { type: 'rhythm', key: 'B' },
  { type: 'chord', chord: 'G' },
  { type: 'text', text: 'кричать' },
  { type: 'repeat', times: 2 },
];

describe('splitLine / joinLine', () => {
  test('splits text and marks with their positions', () => {
    expect(splitLine(items)).toEqual({
      text: 'Зачем кричать',
      marks: [
        { pos: 0, item: { type: 'bar' } },
        { pos: 0, item: { type: 'chord', chord: 'Am' } },
        { pos: 6, item: { type: 'rhythm', key: 'B' } },
        { pos: 6, item: { type: 'chord', chord: 'G' } },
        { pos: 13, item: { type: 'repeat', times: 2 } },
      ],
    });
  });

  test('joins back without loss', () => {
    const { text, marks } = splitLine(items);
    expect(joinLine(text, marks)).toEqual(items);
  });

  test('sorts marks by position, keeping order at the same position', () => {
    expect(
      joinLine('abc', [
        { pos: 2, item: { type: 'chord', chord: 'G' } },
        { pos: 0, item: { type: 'bar' } },
        { pos: 0, item: { type: 'chord', chord: 'Am' } },
      ]),
    ).toEqual([
      { type: 'bar' },
      { type: 'chord', chord: 'Am' },
      { type: 'text', text: 'ab' },
      { type: 'chord', chord: 'G' },
      { type: 'text', text: 'c' },
    ]);
  });

  test('marks past the end of the text are clamped to it', () => {
    expect(joinLine('ab', [{ pos: 9, item: { type: 'chord', chord: 'C' } }])).toEqual([
      { type: 'text', text: 'ab' },
      { type: 'chord', chord: 'C' },
    ]);
  });
});
