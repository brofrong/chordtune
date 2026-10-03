/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse } from '@chordtune/chord-sheet';

import { withSongDefaults } from '@/features/library/offline-store';
import type { ArrangementView } from '@/lib/trpc';
import { shapePlayback, songPlayback, songSound } from './playback';

const doc = parse('${E}la').doc;

describe('songSound', () => {
  test('defaults: standard tuning, no voicings', () => {
    const sound = songSound({ capo: null });
    expect(sound.tuning.id).toBe('standard');
    expect(sound.voicings).toEqual({});
  });

  test('a tuned-down song sounds a semitone lower', () => {
    const standard = songPlayback(doc, [], { bpm: 120, ...songSound({ capo: null }) }).notes;
    const lower = songPlayback(doc, [], {
      bpm: 120,
      ...songSound({ capo: null, tuning: 'half-step-down' }),
    }).notes;
    expect(lower.map((note) => note.midi)).toEqual(standard.map((note) => note.midi - 1));
  });

  test("the author's voicing is what sounds", () => {
    const sound = songSound({ capo: 2, voicings: { E: [0, null, null, null, null, null] } });
    const notes = songPlayback(doc, [], { bpm: 120, ...sound }).notes;
    expect(new Set(notes.map((note) => note.midi))).toEqual(new Set([42]));
  });

  test('shapePlayback strums a shape with capo and shift', () => {
    const sound = songSound({ capo: 1, tuning: 'd-standard' });
    expect(shapePlayback([0, null, null, null, null, null], sound)[0]?.midi).toBe(39);
  });
});

describe('withSongDefaults', () => {
  test('old offline copies get standard tuning, no voicings, no zen mode', () => {
    const old = { id: 'a', capo: null } as unknown as ArrangementView;
    expect(withSongDefaults(old)).toMatchObject({
      tuning: 'standard',
      voicings: {},
      zenMode: null,
    });
    const fresh = { id: 'b', tuning: 'open-g', voicings: { G: [0] }, zenMode: 'strip' };
    expect(withSongDefaults(fresh as unknown as ArrangementView)).toMatchObject(fresh);
  });
});
