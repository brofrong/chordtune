import { describe, expect, test } from 'bun:test';

import { parseAlphaTex } from './alphatex';
import { countUnreachable, refretBlock, rewriteAlphaTex } from './refret';
import type { TabBlock } from './tab';
import { GUITAR_TUNINGS } from './tuning';

const STANDARD = GUITAR_TUNINGS.standard;
const block = (source: string) => parseAlphaTex(source.split('\n')).block;
const notes = (tab: TabBlock) =>
  tab.bars.flatMap((bar) =>
    bar.beats.map((beat) => beat.notes.map((n) => `${n.fret}.${n.string}`).join('+')),
  );
const pitches = (tab: TabBlock, capo: number) =>
  tab.bars.flatMap((bar) =>
    bar.beats.flatMap((beat) =>
      beat.notes.map((n) => (n.fret === 'x' ? 'x' : (STANDARD[6 - n.string] ?? 0) + n.fret + capo)),
    ),
  );

describe('refretBlock', () => {
  test('capo down: same strings, higher frets', () => {
    const tab = block('0.1 3.2 (0.5 2.4)');
    const moved = refretBlock(tab, STANDARD, 2, 0);
    expect(notes(moved.block)).toEqual(['2.1', '5.2', '2.5+4.4']);
    expect(moved.unreachable).toBe(0);
    expect(pitches(moved.block, 0)).toEqual(pitches(tab, 2));
  });

  test('capo up: an open note moves to a thicker string', () => {
    const moved = refretBlock(block('0.1 5.2'), STANDARD, 0, 2);
    // E4 open → B string 3rd fret with capo 2; E4 on B 5 → B 3.
    expect(notes(moved.block)).toEqual(['3.2', '3.2']);
    expect(pitches(moved.block, 2)).toEqual(pitches(block('0.1 5.2'), 0));
  });

  test('two notes of one beat never share a string', () => {
    const tab = block('(0.1 3.2)');
    const moved = refretBlock(tab, STANDARD, 0, 2);
    const strings = moved.block.bars[0]?.beats[0]?.notes.map((n) => n.string) ?? [];
    expect(new Set(strings).size).toBe(2);
    expect(pitches(moved.block, 2)).toEqual(pitches(tab, 0));
  });

  test('a note below the capo on the low E is unreachable but keeps its pitch', () => {
    const moved = refretBlock(block('0.6 2.6'), STANDARD, 0, 3);
    expect(moved.unreachable).toBe(2);
    expect(moved.block.bars[0]?.beats[0]?.notes[0]).toMatchObject({
      string: 6,
      fret: -3,
      unreachable: true,
    });
    expect(countUnreachable(moved.block)).toBe(2);
    expect(pitches(moved.block, 3)).toEqual([40, 42]);
  });

  test('a chord searches assignments together: no note needs to go unreachable', () => {
    const tab = block('(0.1 6.6 0.5)');
    const moved = refretBlock(tab, STANDARD, 0, 1);
    expect(moved.unreachable).toBe(0);
    const strings = moved.block.bars[0]?.beats[0]?.notes.map((n) => n.string) ?? [];
    expect(new Set(strings).size).toBe(3);
    expect(notes(moved.block)).toEqual(['4.2+0.5+4.6']);
    expect(pitches(moved.block, 1)).toEqual(pitches(tab, 0));
  });

  test('an always-unreachable note reserves its string so another note cannot collide with it', () => {
    const tab = block('(0.6 0.5)');
    const moved = refretBlock(tab, STANDARD, 0, 3);
    const beatNotes = moved.block.bars[0]?.beats[0]?.notes ?? [];
    const strings = beatNotes.map((n) => n.string);
    // Both end up unreachable: capo 3 needs an open string at or below E2 − 3, and once the
    // open low E's home string (6, the only one low enough for the low E itself) is reserved,
    // it is also the only string low enough for the open A (its pitch is only 5 above E2) — so
    // the A note cannot actually move anywhere else and is honestly marked unreachable too, on
    // its own (distinct) string, rather than being silently placed on top of the low E.
    expect(new Set(strings).size).toBe(2);
    expect(beatNotes[0]).toMatchObject({ string: 6, fret: -3, unreachable: true });
    expect(beatNotes[1]).toMatchObject({ string: 5, fret: -3, unreachable: true });
    expect(moved.unreachable).toBe(2);
    expect(pitches(moved.block, 3)).toEqual(pitches(tab, 0));
  });

  test('a tie follows its note to the new string', () => {
    const moved = refretBlock(block('0.1 -.1'), STANDARD, 0, 2);
    expect(notes(moved.block)).toEqual(['3.2', '3.2']);
    expect(moved.block.bars[0]?.beats[1]?.notes[0]?.tie).toBe(true);
  });

  test('dead notes stay, hammer-ons across strings are dropped', () => {
    const moved = refretBlock(block('x.1 0.1{h} 2.1'), STANDARD, 0, 1);
    expect(notes(moved.block)).toEqual(['x.1', '4.2', '1.1']);
    expect(moved.block.bars[0]?.beats[1]?.notes[0]?.effects.hammer).toBeUndefined();
    const kept = refretBlock(block('2.1{h} 4.1'), STANDARD, 0, 1);
    expect(kept.block.bars[0]?.beats[0]?.notes[0]?.effects.hammer).toBe(true);
  });
});

describe('rewriteAlphaTex', () => {
  test('only the note numbers change', () => {
    const source = ['\\tempo 90', '\\lyrics "ла"', ':8 0.1{h} 3.2 | (0.5 2.4).4 -.4 r'];
    const before = parseAlphaTex(source).block;
    const after = refretBlock(before, STANDARD, 2, 0).block;
    expect(rewriteAlphaTex(source, before, after)).toEqual([
      '\\tempo 90',
      '\\lyrics "ла"',
      ':8 2.1{h} 5.2 | (2.5 4.4).4 -.4 r',
    ]);
  });

  test('null when the source has a bad note or a note is unreachable', () => {
    const broken = ['0.1 3.9 2.2'];
    const before = parseAlphaTex(broken).block;
    expect(rewriteAlphaTex(broken, before, refretBlock(before, STANDARD, 1, 0).block)).toBeNull();
    const low = ['0.6'];
    const lowBlock = parseAlphaTex(low).block;
    expect(rewriteAlphaTex(low, lowBlock, refretBlock(lowBlock, STANDARD, 0, 3).block)).toBeNull();
  });
});
