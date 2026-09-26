import { describe, expect, test } from 'bun:test';
import {
  RHYTHM_PRESETS,
  type Rhythm,
  rhythmFromPreset,
  type TimelineEvent,
} from '@chordtune/chord-sheet';

import { eventSeconds, scheduleNotes } from './strum-schedule';

const preset = (id: string, key = 'A'): Rhythm =>
  rhythmFromPreset(RHYTHM_PRESETS.find((p) => p.id === id)!, key);

const event = (
  chord: string,
  start: number,
  length: number,
  rhythm: string | null = 'A',
): TimelineEvent => ({
  chord,
  rhythm,
  bar: Math.floor(start),
  start,
  length,
  section: 0,
  line: 0,
  item: 0,
});

/** Stroke onsets: notes of one stroke are spread by a few ms, steps are ≥ 0.25 s apart. */
function onsets(times: number[]): number[] {
  return [...new Set(times.map((time) => Math.round(time * 4) / 4))];
}

describe('scheduleNotes', () => {
  test('six at 60 BPM on one bar of Am', () => {
    const notes = scheduleNotes([event('Am', 0, 1)], [preset('six')], { bpm: 60 });
    expect(onsets(notes.map((note) => note.time))).toEqual([0, 1, 1.5, 2.5, 3, 3.5]);
    const down = notes.filter((note) => note.time < 0.5);
    expect(down.map((note) => note.string)).toEqual([5, 4, 3, 2, 1]);
    expect(down.map((note) => note.time)).toEqual(
      [0, 0.01, 0.02, 0.03, 0.04].map((t) => expect.closeTo(t, 9)),
    );
    expect(down.map((note) => note.midi)).toEqual([45, 52, 57, 60, 64]);
    const up = notes.filter((note) => note.time >= 1.5 && note.time < 2);
    expect(up.map((note) => note.string)).toEqual([1, 2, 3, 4]);
    expect(up.every((note) => note.gain === 0.8 && !note.muted)).toBe(true);
  });

  test('muted strokes and accents', () => {
    const notes = scheduleNotes([event('Am', 0, 1)], [preset('six-muted')], { bpm: 60 });
    const hit = notes.filter((note) => note.time >= 1 && note.time < 1.5);
    expect(hit.map((note) => note.string)).toEqual([6, 5, 4, 3, 2, 1]);
    expect(hit.every((note) => note.muted)).toBe(true);

    const four = scheduleNotes([event('C', 0, 1)], [preset('four')], { bpm: 60 });
    expect(four[0]?.gain).toBeCloseTo(1.3, 9);
  });

  test('picking follows the bass of the chord', () => {
    const notes = scheduleNotes([event('Am', 0, 1)], [preset('pick-eight')], { bpm: 120 });
    expect(notes.map((note) => note.string)).toEqual([5, 3, 2, 3, 1, 3, 2, 3]);
    expect(notes.map((note) => note.time)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);

    const pinch = scheduleNotes([event('Am', 0, 1)], [preset('pinch')], { bpm: 60 });
    expect(pinch.filter((note) => note.time === 2).map((note) => note.string)).toEqual([4]);
  });

  test('half-bar chords take their half of the pattern', () => {
    const notes = scheduleNotes(
      [event('Am', 0, 0.5), event('G', 0.5, 0.5)],
      [preset('pick-eight')],
      { bpm: 120 },
    );
    // The pattern keeps its place in the bar, so G starts on step 5 (string 1), not on the bass.
    expect(notes.map((note) => note.string)).toEqual([5, 3, 2, 3, 1, 3, 2, 3]);
    expect(notes[4]?.midi).toBe(67);
  });

  test('bars follow the time signature of their rhythm', () => {
    const rhythms = [preset('six'), preset('waltz', 'B')];
    const events = [event('Am', 0, 1), event('G', 1, 1, 'B'), event('C', 2, 1)];
    expect(eventSeconds(events, rhythms, 60)).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 7 },
      { start: 7, end: 11 },
    ]);
  });

  test('without a rhythm every beat is a down stroke; unknown chords are silent', () => {
    const notes = scheduleNotes([event('Am', 0, 1, null), event('Xyz', 1, 1, null)], [], {
      bpm: 60,
    });
    expect(onsets(notes.map((note) => note.time))).toEqual([0, 1, 2, 3]);
  });
});
