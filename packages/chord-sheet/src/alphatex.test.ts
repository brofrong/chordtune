import { describe, expect, test } from 'bun:test';

import { parseAlphaTex } from './alphatex';
import { tabBeats, tabQuarters } from './tab';

const parseTex = (source: string, firstLineNo = 1) =>
  parseAlphaTex(source.split('\n'), firstLineNo);

const frets = (source: string) =>
  parseTex(source).block.bars.map((bar) =>
    bar.beats.map((beat) => beat.notes.map((n) => `${n.fret}.${n.string}`).join('+') || 'r'),
  );

const RIFF = [
  ':8 0.5 5.3 8.2 0.5 5.3 5.2 0.5 5.3 | 6.2 0.5 5.3 5.2 0.5 5.3 5.2 5.3 | 5.4 5.3 8.2 5.4 5.3 5.2 5.4 5.3 | 6.2 5.4 5.3 5.2 5.4 5.3 5.2 5.3 |',
  '',
  '3.4 5.3 3.1 3.4 5.3 5.2 3.4 5.3 | 6.2 3.4 5.3 5.2 3.4 5.3 5.2 5.3 | 5.5 7.4 0.3 5.5 7.4 0.3 5.5 7.4 | 5.5 7.4 0.3 5.5 7.4 0.3 5.5 7.4 |',
].join('\n');

describe('parseAlphaTex', () => {
  test('the riff: eighth notes, eight full bars, blank lines and a trailing bar line', () => {
    const { block, diagnostics } = parseTex(RIFF);
    expect(diagnostics).toEqual([]);
    expect(block.time).toEqual([4, 4]);
    expect(block.tempo).toBeNull();
    expect(block.bars).toHaveLength(8);
    expect(frets(RIFF)[0]).toEqual(['0.5', '5.3', '8.2', '0.5', '5.3', '5.2', '0.5', '5.3']);
    expect(block.bars.every((bar) => bar.beats.every((b) => b.duration === 8))).toBe(true);
    expect(block.playOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(tabQuarters(block)).toBe(32);
  });

  test('.N is for one beat, :N for all that follow; the default is a quarter', () => {
    const { block } = parseTex('0.6 8.2.16 5.3 :8 5.2 r');
    expect(block.bars[0]?.beats.map((b) => b.duration)).toEqual([4, 16, 4, 8, 8]);
  });

  test('dots and triplets change the length; a short bar is a warning', () => {
    const { block, diagnostics } = parseTex('0.6{d} :8 1.6{tu 3} 2.6{tu 3} 3.6{tu 3} 0.6');
    const beats = block.bars[0]?.beats ?? [];
    expect(beats.map((b) => b.quarters)).toEqual(
      [1.5, 1 / 3, 1 / 3, 1 / 3, 0.5].map((q) => expect.closeTo(q, 9)),
    );
    expect(beats[0]?.dotted).toBe(true);
    expect(beats[1]?.tuplet).toBe(3);
    expect(diagnostics).toEqual([
      { line: 1, col: 1, severity: 'warning', message: 'Bar 1: 3 of 4 quarter notes' },
    ]);
  });

  test('chords, rests, dead notes and ties', () => {
    const { block, diagnostics } = parseTex('(0.5 2.4).2 3.3 -.3 | x.6 r.2 r');
    expect(diagnostics).toEqual([]);
    const [chord, note, tie] = block.bars[0]?.beats ?? [];
    expect(chord?.notes.map((n) => [n.fret, n.string])).toEqual([
      [0, 5],
      [2, 4],
    ]);
    expect(chord?.duration).toBe(2);
    expect(note?.notes[0]?.tie).toBe(false);
    expect(tie?.notes[0]).toMatchObject({ fret: 3, string: 3, tie: true });
    const [dead, half, quarter] = block.bars[1]?.beats ?? [];
    expect(dead?.notes[0]?.fret).toBe('x');
    expect(half?.notes).toEqual([]);
    expect(half?.duration).toBe(2);
    expect(quarter?.duration).toBe(4);
  });

  test('effects on notes and beats', () => {
    const { block, diagnostics } = parseTex(
      '3.3{h} 5.3 7.2{sl} 9.2 | 7.3{b (0 4) v} 0.6{pm} 0.6{pm lr} (0.5{h} 2.4).4{txt "тише"}',
    );
    expect(diagnostics).toEqual([]);
    const [first, , third] = block.bars[0]?.beats ?? [];
    expect(first?.notes[0]?.effects).toEqual({ hammer: true });
    expect(third?.notes[0]?.effects).toEqual({ slide: true });
    const [bend, pm, pmLr, chord] = block.bars[1]?.beats ?? [];
    expect(bend?.notes[0]?.effects).toEqual({ bend: [0, 4], vibrato: true });
    expect(pm?.palmMute).toBe(true);
    expect(pmLr).toMatchObject({ palmMute: true, letRing: true });
    expect(chord?.text).toBe('тише');
    expect(chord?.notes[0]?.effects).toEqual({ hammer: true });
    expect(chord?.notes[1]?.effects).toEqual({});
  });

  test('lyrics go to beats that start a note; _ skips one', () => {
    const { block, diagnostics } = parseTex(
      '\\lyrics "Я за-бу-ду _ мя"\n:8 0.6 r 2.6 3.6 -.6 5.6 7.6 8.6',
    );
    expect(diagnostics).toEqual([]);
    expect(block.bars[0]?.beats.map((b) => b.syllable)).toEqual([
      'Я',
      null,
      'за-',
      'бу-',
      null,
      'ду',
      null,
      'мя',
    ]);
  });

  test('lyrics left over are a warning', () => {
    const { diagnostics } = parseTex('\\lyrics "раз два три"\n0.6 0.6 r r');
    expect(diagnostics).toEqual([
      { line: 1, col: 9, severity: 'warning', message: 'Syllables without notes: 1' },
    ]);
  });

  test('tempo and time signature', () => {
    const { block, diagnostics } = parseTex('\\tempo 140\n\\ts 3 4\n0.6 0.6 0.6');
    expect(diagnostics).toEqual([]);
    expect(block.tempo).toBe(140);
    expect(block.time).toEqual([3, 4]);
  });

  test('a tempo out of range is ignored', () => {
    const { block, diagnostics } = parseTex('\\tempo 500\n0.6.1');
    expect(block.tempo).toBeNull();
    expect(diagnostics).toEqual([
      { line: 1, col: 1, severity: 'warning', message: 'Tempo must be 30–300: 500' },
    ]);
  });

  test('repeats unroll into the play order', () => {
    const { block, diagnostics } = parseTex('\\ro 0.6.1 | \\rc 3 2.6.1 | 3.6.1');
    expect(diagnostics).toEqual([]);
    expect(block.bars[0]?.repeatOpen).toBe(true);
    expect(block.bars[1]?.repeatClose).toBe(3);
    expect(block.playOrder).toEqual([0, 1, 0, 1, 0, 1, 2]);
  });

  test('nested repeats are an error', () => {
    const { diagnostics } = parseTex('\\ro 0.6.1 | \\ro 2.6.1');
    expect(diagnostics).toContainEqual({
      line: 1,
      col: 13,
      severity: 'error',
      message: 'Nested repeats are not supported',
    });
  });

  test('problems point at the song line and column', () => {
    const { diagnostics } = parseAlphaTex(['0.6 0.6 0.6 0.6 |', '9.7 abc 0.6 {zz} 0.6'], 10);
    expect(diagnostics).toEqual([
      { line: 11, col: 1, severity: 'error', message: 'String must be 1–6: 9.7' },
      { line: 11, col: 5, severity: 'error', message: 'Not a note: abc' },
      { line: 11, col: 14, severity: 'warning', message: 'Unknown effect: zz' },
      { line: 11, col: 9, severity: 'warning', message: 'Bar 2: 2 of 4 quarter notes' },
    ]);
  });

  test('never throws', () => {
    for (const source of [
      '',
      '(',
      '{',
      '"',
      '\\',
      ':',
      '|',
      '-.1',
      '0.1{b (',
      '(0.1',
      '\\rc',
      '0.1.3',
      ':0',
      '0.1{txt}',
      '()',
      '\\lyrics',
    ]) {
      expect(() => parseTex(source)).not.toThrow();
    }
  });
});

describe('tabBeats', () => {
  test('beats in play order with their start in quarter notes', () => {
    const { block } = parseTex('\\ts 1 4\n\\ro :8 0.6 2.6 \\rc 2');
    expect(tabBeats(block)).toEqual([
      { bar: 0, beat: 0, start: 0, quarters: 0.5 },
      { bar: 0, beat: 1, start: 0.5, quarters: 0.5 },
      { bar: 0, beat: 0, start: 1, quarters: 0.5 },
      { bar: 0, beat: 1, start: 1.5, quarters: 0.5 },
    ]);
    expect(tabQuarters(block)).toBe(2);
  });

  test('an empty block has no bars and no length', () => {
    const { block, diagnostics } = parseTex('');
    expect(block.bars).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(tabQuarters(block)).toBe(0);
  });
});
