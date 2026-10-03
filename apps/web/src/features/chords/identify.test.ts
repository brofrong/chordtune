/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { chordInstrument, identify } from './identify';

const GUITAR = [40, 45, 50, 55, 59, 64];
const BASS = [28, 33, 38, 43];
const UKULELE = [67, 60, 64, 69];

describe('identify', () => {
  test('nothing pressed', () => {
    expect(identify([null, null, null, null, null, null], GUITAR)).toEqual({ kind: 'empty' });
  });

  test('one note, even on two strings', () => {
    // B string 5th fret and the open high E are the same E4.
    expect(identify([null, null, null, null, 5, 0], GUITAR)).toEqual({
      kind: 'note',
      notes: ['E'],
    });
  });

  test('a fifth is a power chord, other pairs are intervals', () => {
    expect(identify([0, 2, null, null], BASS)).toEqual({
      kind: 'chord',
      notes: ['E', 'B'],
      names: ['E5'],
    });
    // E2 (6th string open) and G3 (4th string open): a minor third above E.
    expect(identify([0, null, null, 0, null, null], GUITAR)).toEqual({
      kind: 'interval',
      notes: ['E', 'G'],
      semitones: 3,
    });
    expect(identify([0, 1, null, null, null, null], GUITAR)).toEqual({
      kind: 'interval',
      notes: ['E', 'Bb'],
      semitones: 6,
    });
  });

  test('chords: up to three names, notes from the lowest up', () => {
    const am = identify([null, 0, 2, 2, 1, 0], GUITAR);
    expect(am.kind).toBe('chord');
    if (am.kind === 'chord') {
      expect(am.names[0]).toBe('Am');
      expect(am.names.length).toBeLessThanOrEqual(3);
      expect(am.notes).toEqual(['A', 'E', 'C']);
    }
  });

  test('ukulele is re-entrant: Am, and no slash chords', () => {
    const am = identify([2, 0, 0, 0], UKULELE);
    expect(am.kind).toBe('chord');
    if (am.kind === 'chord') {
      expect(am.names[0]).toBe('Am');
      expect(am.names.some((name) => name.includes('/'))).toBe(false);
    }
  });

  test('three notes of no known chord still list their notes', () => {
    // E2, Bb2, Eb3.
    expect(identify([0, 1, 1, null, null, null], GUITAR)).toEqual({
      kind: 'unknown',
      notes: ['E', 'Bb', 'Eb'],
    });
  });

  test('frets past the last string are ignored', () => {
    const am = identify([2, 0, 0, 0, 5, 5], UKULELE);
    expect(am.kind === 'chord' && am.names[0]).toBe('Am');
  });
});

describe('chordInstrument', () => {
  test('tuner setting as a tuning with strings', () => {
    expect(chordInstrument('ukulele', 'standard').strings).toEqual(UKULELE);
    expect(chordInstrument('bass', 'drop-d').strings).toEqual([26, 33, 38, 43]);
  });

  test('chromatic has no strings: guitar standard', () => {
    expect(chordInstrument('chromatic', 'chromatic').strings).toEqual(GUITAR);
  });
});
