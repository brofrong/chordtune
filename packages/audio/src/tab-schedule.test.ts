import { describe, expect, test } from 'bun:test';
import { parseAlphaTex } from '@chordtune/chord-sheet';

import { scheduleTab } from './tab-schedule';

const block = (source: string) => parseAlphaTex(source.split('\n')).block;

describe('scheduleTab', () => {
  test('pitch from the string, fret and capo; time from the durations', () => {
    const notes = scheduleTab(block(':8 0.6 5.3 (0.5 2.4).4'), { bpm: 60, capo: 2 });
    expect(notes.map((n) => [n.time, n.midi, n.string])).toEqual([
      [0, 42, 6],
      [0.5, 62, 3],
      [1, 47, 5],
      [1, 54, 4],
    ]);
  });

  test('ties ring on, dead notes and palm mute are muted, legato is softer', () => {
    const notes = scheduleTab(block('3.3{h} 5.3 -.3 x.6 0.6{pm}'), { bpm: 60 });
    expect(notes.map((n) => [n.time, n.midi, n.muted])).toEqual([
      [0, 58, false],
      [1, 60, false],
      [3, 40, true],
      [4, 40, true],
    ]);
    expect(notes[1]?.gain ?? 1).toBeLessThan(notes[0]?.gain ?? 0);
  });

  test('repeats play again', () => {
    expect(scheduleTab(block('\\ro 0.6.2 \\rc 2'), { bpm: 60 }).map((n) => n.time)).toEqual([0, 2]);
  });
});
