/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { diagramLayout } from './diagram-layout';

describe('diagramLayout', () => {
  test('open chord from the nut', () => {
    expect(diagramLayout([null, 0, 2, 2, 1, 0])).toEqual({
      base: 1,
      dots: [
        { string: 2, fret: 2 },
        { string: 3, fret: 2 },
        { string: 4, fret: 1 },
      ],
      open: [1, 5],
      muted: [0],
      barre: null,
    });
  });

  test('barre at the nut: the barre string dots are not repeated', () => {
    expect(diagramLayout([1, 3, 3, 2, 1, 1])).toEqual({
      base: 1,
      dots: [
        { string: 1, fret: 3 },
        { string: 2, fret: 3 },
        { string: 3, fret: 2 },
      ],
      open: [],
      muted: [],
      barre: { fret: 1, from: 0, to: 5 },
    });
  });

  test('up the neck: frets relative to the lowest fretted fret', () => {
    expect(diagramLayout([null, 6, 8, 8, 8, 6])).toEqual({
      base: 6,
      dots: [
        { string: 2, fret: 3 },
        { string: 3, fret: 3 },
        { string: 4, fret: 3 },
      ],
      open: [],
      muted: [0],
      barre: { fret: 1, from: 1, to: 5 },
    });
  });

  test('a shape that reaches the 5th fret still starts at the nut', () => {
    expect(diagramLayout([null, null, 2, 4, 5, 2]).base).toBe(1);
    expect(diagramLayout([null, null, 3, 5, 6, 3]).base).toBe(3);
  });
});
