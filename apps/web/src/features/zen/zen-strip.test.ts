/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { stripChordRoles } from './zen-strip';

describe('stripChordRoles', () => {
  test('tags the sounding chord and the next one, the rest plain', () => {
    expect(stripChordRoles({ chords: ['Am', 'F', 'C', 'G'], current: 1, next: 2 })).toEqual([
      { chord: 'Am', role: 'plain' },
      { chord: 'F', role: 'current' },
      { chord: 'C', role: 'next' },
      { chord: 'G', role: 'plain' },
    ]);
  });

  test('no current or next tag when both are null', () => {
    expect(stripChordRoles({ chords: ['Em', 'D'], current: null, next: null })).toEqual([
      { chord: 'Em', role: 'plain' },
      { chord: 'D', role: 'plain' },
    ]);
  });

  test('an empty strip tags nothing', () => {
    expect(stripChordRoles({ chords: [], current: null, next: null })).toEqual([]);
  });
});
