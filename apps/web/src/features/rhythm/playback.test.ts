/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse } from '@chordtune/chord-sheet';

import { beatAt, playingAt, songPlayback, tabPlayback } from './playback';

const doc = parse(
  ['${Am}a', '{start_of_alphatex}', '0.6 0.6 0.6 0.6', '{end_of_alphatex}'].join('\n'),
).doc;

describe('songPlayback', () => {
  test('speed divides every time', () => {
    const normal = songPlayback(doc, [], { bpm: 60 });
    const slow = songPlayback(doc, [], { bpm: 60, speed: 0.5 });
    expect(slow.seconds).toEqual(
      normal.seconds.map(({ start, end }) => ({ start: start * 2, end: end * 2 })),
    );
    expect(slow.notes.map((n) => n.time)).toEqual(normal.notes.map((n) => n.time * 2));
  });

  test('playingAt finds the chord or the tab beat', () => {
    const playback = songPlayback(doc, [], { bpm: 60 });
    expect(playingAt(playback, 1)).toEqual({ section: 0, line: 0, item: 0, beat: null });
    expect(playingAt(playback, 6.5)).toEqual({
      section: 0,
      line: 1,
      item: null,
      beat: { bar: 0, beat: 2 },
    });
    expect(playingAt(playback, 99)).toBeNull();
  });

  test('tab-only song has notes', () => {
    const tabOnly = parse('{start_of_alphatex}\n0.6 0.6\n{end_of_alphatex}').doc;
    expect(songPlayback(tabOnly, [], { bpm: 60 }).notes.map((n) => n.time)).toEqual([0, 1]);
  });

  test('capo shifts the song', () => {
    const plain = songPlayback(doc, [], { bpm: 60 }).notes.map((n) => n.midi);
    const capo = songPlayback(doc, [], { bpm: 60, capo: 2 }).notes.map((n) => n.midi);
    expect(capo).toEqual(plain.map((midi) => midi + 2));
  });
});

describe('tabPlayback', () => {
  test('the block tempo wins, speed scales, beatAt follows', () => {
    const block = parse('{start_of_alphatex}\n\\tempo 120\n0.6 0.6\n{end_of_alphatex}').doc
      .sections[0]?.lines[0];
    if (block?.type !== 'alphatex') {
      throw new Error('expected a block');
    }
    const playback = tabPlayback(block.block, { bpm: 60, speed: 2 });
    expect(playback.beatStarts).toEqual([0, 0.25]);
    expect(playback.notes.map((n) => n.time)).toEqual([0, 0.25]);
    expect(beatAt(playback, 0.3)).toEqual({ bar: 0, beat: 1 });
  });
});
