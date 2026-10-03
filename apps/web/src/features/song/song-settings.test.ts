/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { readSongSettings, songSettingsKey } from './song-settings';

describe('readSongSettings', () => {
  test('valid values', () => {
    expect(readSongSettings('{"capo":3,"zenMode":"strip"}')).toEqual({ capo: 3, zenMode: 'strip' });
    expect(readSongSettings('{"capo":0,"zenMode":null}')).toEqual({ capo: 0, zenMode: null });
  });

  test('missing, broken or invalid values read as null', () => {
    expect(readSongSettings(null)).toEqual({ capo: null, zenMode: null });
    expect(readSongSettings('{oops')).toEqual({ capo: null, zenMode: null });
    expect(readSongSettings('{"capo":13,"zenMode":"auto"}')).toEqual({ capo: null, zenMode: null });
    expect(readSongSettings('{"capo":2.5}')).toEqual({ capo: null, zenMode: null });
    expect(readSongSettings('[1]')).toEqual({ capo: null, zenMode: null });
  });

  test('key per arrangement', () => {
    expect(songSettingsKey('abc')).toBe('chordtune.song.abc');
  });
});
