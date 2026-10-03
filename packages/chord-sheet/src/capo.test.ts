import { describe, expect, test } from 'bun:test';

import { recalcBlock, withCapo } from './capo';
import { parse } from './parse';
import { serialize } from './serialize';
import { GUITAR_TUNINGS } from './tuning';

const STANDARD = GUITAR_TUNINGS.standard;
const SONG = [
  '[Куплет]',
  '${F}Мы ${C}идём ${Dm}домой',
  '{start_of_tab}',
  'e|---0---|',
  '{end_of_tab}',
  '{start_of_alphatex}',
  '3.2 1.2 0.3',
  '{end_of_alphatex}',
].join('\n');

describe('withCapo', () => {
  test('chords move, alphaTex is rewritten, ASCII tabs stay', () => {
    const { doc, unreachable, stale } = withCapo(parse(SONG).doc, STANDARD, 0, 5);
    expect(unreachable).toBe(0);
    expect(stale).toBe(0);
    const text = serialize(doc);
    expect(text).toContain('${C}Мы ${G}идём ${Am}домой');
    expect(text).toContain('e|---0---|');
    expect(text).not.toContain('3.2 1.2 0.3');
  });

  test('chord names survive a round trip', () => {
    // Tab notes may come back on other strings (each move prefers the note's current string),
    // so the round trip is checked on chords only.
    const original = parse('${F}Мы ${C}идём ${Dm}домой ${Am7}всегда').doc;
    const there = withCapo(original, STANDARD, 0, 3).doc;
    expect(serialize(there)).toContain('${D}Мы ${A}идём ${Bm}домой ${F#m7}всегда');
    const back = withCapo(there, STANDARD, 3, 0).doc;
    expect(serialize(back)).toBe(serialize(original));
  });

  test('same capo: the very same document', () => {
    const doc = parse(SONG).doc;
    expect(withCapo(doc, STANDARD, 2, 2).doc).toBe(doc);
  });

  test('unreachable notes and stale blocks are counted', () => {
    // Unreachable notes always make their block stale too (its source cannot be rewritten), so
    // this block is not also a "broken tab": the one message about unreachable notes covers it.
    const low = parse('{start_of_alphatex}\n0.6 2.6\n{end_of_alphatex}').doc;
    expect(withCapo(low, STANDARD, 0, 3)).toMatchObject({
      unreachable: 2,
      stale: 1,
      brokenTabs: 0,
    });
    // Stale for its own reason — the tab's note count does not match its source — with no
    // unreachable note to blame: a genuine "broken tab".
    const broken = parse('{start_of_alphatex}\n0.1 3.9\n{end_of_alphatex}').doc;
    expect(withCapo(broken, STANDARD, 1, 0)).toMatchObject({
      unreachable: 0,
      stale: 1,
      brokenTabs: 1,
    });
  });
});

describe('recalcBlock', () => {
  test('a block with unreachable notes is not also counted as a broken tab', () => {
    expect(recalcBlock(2, null)).toEqual({ unreachable: 2, brokenTabs: 0 });
  });

  test('a stale block with no unreachable notes is a broken tab', () => {
    expect(recalcBlock(0, null)).toEqual({ unreachable: 0, brokenTabs: 1 });
  });

  test('a block that rewrote cleanly is neither', () => {
    expect(recalcBlock(0, ['0.1'])).toEqual({ unreachable: 0, brokenTabs: 0 });
  });
});
