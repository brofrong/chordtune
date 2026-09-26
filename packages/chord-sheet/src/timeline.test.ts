import { describe, expect, test } from 'bun:test';

import { chordList, lyrics } from './extract';
import { parse } from './parse';
import type { Rhythm } from './rhythm';
import { timeline } from './timeline';

const rhythm = (key: string): Rhythm => ({
  key,
  name: key,
  kind: 'strum',
  time: '4/4',
  steps: [{ stroke: 'D' }],
});
const RHYTHMS = [rhythm('A'), rhythm('B')];

function events(source: string, rhythms: Rhythm[] = RHYTHMS) {
  return timeline(parse(source).doc, rhythms).map(({ chord, rhythm, bar, start, length }) => ({
    chord,
    rhythm,
    bar,
    start,
    length,
  }));
}

describe('timeline', () => {
  test('bars split between their chords', () => {
    expect(events('|${Am}a ${G}b|${F}c|')).toEqual([
      { chord: 'Am', rhythm: 'A', bar: 0, start: 0, length: 0.5 },
      { chord: 'G', rhythm: 'A', bar: 0, start: 0.5, length: 0.5 },
      { chord: 'F', rhythm: 'A', bar: 1, start: 1, length: 1 },
    ]);
  });

  test('without bars every chord is a bar', () => {
    expect(
      events('${Am}Зачем ${G}кричать\n${F}когда').map((e) => [e.chord, e.start, e.length]),
    ).toEqual([
      ['Am', 0, 1],
      ['G', 1, 1],
      ['F', 2, 1],
    ]);
  });

  test('a group with only text holds the previous chord, empty groups are skipped', () => {
    expect(
      events('|${Em}No smoke without| fire|| |').map((e) => [e.chord, e.start, e.length]),
    ).toEqual([['Em', 0, 2]]);
  });

  test('repeat plays the line from its start or the previous repeat', () => {
    expect(events('${G} ${B} ${x2} ${C} ${x3}').map((e) => [e.chord, e.start])).toEqual([
      ['G', 0],
      ['B', 1],
      ['G', 2],
      ['B', 3],
      ['C', 4],
      ['C', 5],
      ['C', 6],
    ]);
  });

  test('rhythm markers carry over section boundaries', () => {
    const source = '[Куплет]\n${Am}a @B${G}b\n[Припев]\n${F}c\n[Бридж] @A\n${Dm}d';
    expect(events(source).map((e) => [e.chord, e.rhythm])).toEqual([
      ['Am', 'A'],
      ['G', 'B'],
      ['F', 'B'],
      ['Dm', 'A'],
    ]);
  });

  test('no rhythms means null rhythm', () => {
    expect(events('${Am}', [])[0]?.rhythm).toBeNull();
  });

  test('events point back at the source', () => {
    const [first, second] = timeline(parse('intro\n[Куплет]\ntext\n${Am}a ${G}b').doc, RHYTHMS);
    expect(first).toMatchObject({ section: 1, line: 1, item: 0 });
    expect(second).toMatchObject({ section: 1, line: 1, item: 2 });
  });

  test('tabs are skipped', () => {
    expect(events('${Am}\n{start_of_tab}\ne|--|\n{end_of_tab}\n${G}').map((e) => e.start)).toEqual([
      0, 1,
    ]);
  });
});

describe('chordList', () => {
  test('unique chords in order, German H as B, non-chords dropped', () => {
    const { doc } = parse('${Am} ${Hm} ${Am} ${Xyz}\n[Припев]\n${F#m7/C#} ${Bm}');
    expect(chordList(doc)).toEqual(['Am', 'Bm', 'F#m7/C#']);
  });
});

describe('lyrics', () => {
  test('text without chords, markers and tabs', () => {
    const source =
      '[Куплет] @A\n|${Am}Зачем ${G}кричать|\n${E} ${C} ${x2}\n\nпросто текст\n{start_of_tab}\ne|--|\n{end_of_tab}';
    expect(lyrics(parse(source).doc)).toBe('Зачем кричать\n\nпросто текст');
  });
});
