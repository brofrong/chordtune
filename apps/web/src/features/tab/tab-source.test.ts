/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { readBlockMeta, setBlockMeta } from './tab-source';

describe('setBlockMeta', () => {
  test('adds, replaces and removes a command line', () => {
    expect(setBlockMeta([':8 0.6'], 'tempo', '140')).toEqual(['\\tempo 140', ':8 0.6']);
    expect(setBlockMeta(['\\tempo 140', ':8 0.6'], 'tempo', '90')).toEqual([
      '\\tempo 90',
      ':8 0.6',
    ]);
    expect(setBlockMeta(['\\tempo 140', '\\ts 3 4', '0.6'], 'tempo', null)).toEqual([
      '\\ts 3 4',
      '0.6',
    ]);
    expect(setBlockMeta(['0.6'], 'ts', null)).toEqual(['0.6']);
  });
});

describe('readBlockMeta', () => {
  test('returns the raw value, even a half-typed one', () => {
    expect(readBlockMeta(['\\tempo 140', '\\ts 3 4'], 'ts')).toBe('3 4');
    expect(readBlockMeta(['\\tempo 1', '0.6'], 'tempo')).toBe('1');
    expect(readBlockMeta(['0.6'], 'tempo')).toBeNull();
  });
});
