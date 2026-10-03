import { describe, expect, test } from 'bun:test';

import { chordList, chordSpellings, lyrics } from './extract';
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
  return timeline(parse(source).doc, rhythms).flatMap((event) =>
    event.kind === 'chord'
      ? [
          {
            chord: event.chord,
            rhythm: event.rhythm,
            bar: event.bar,
            start: event.start,
            length: event.length,
          },
        ]
      : [],
  );
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

describe('timeline with tabs and tempo', () => {
  const block = (body: string[]) => ['{start_of_alphatex}', ...body, '{end_of_alphatex}'];

  test('an alphaTex block takes its bars and the chords after it follow', () => {
    const doc = parse(
      ['${Am}a', ...block([':8 0.5 5.3 8.2 0.5 5.3 5.2 0.5 5.3 | 0.6.2 0.6.2']), '${G}b'].join(
        '\n',
      ),
    ).doc;
    expect(timeline(doc, RHYTHMS).map((e) => [e.kind, e.start, e.length, e.line])).toEqual([
      ['chord', 0, 1, 0],
      ['tab', 1, 2, 1],
      ['chord', 3, 1, 2],
    ]);
  });

  test('bars of a 3/4 block have three quarters', () => {
    const doc = parse(block(['\\ts 3 4', '0.6 0.6 0.6 | 0.6 0.6 0.6']).join('\n')).doc;
    expect(timeline(doc, RHYTHMS)[0]).toMatchObject({ kind: 'tab', length: 2 });
  });

  test('tempo: the block, else the section, else the song (null)', () => {
    const doc = parse(
      [
        '[A] 140bpm',
        '${Am}a',
        ...block(['0.6.1']),
        ...block(['\\tempo 70', '0.6.1']),
        '[B]',
        '${G}b',
      ].join('\n'),
    ).doc;
    expect(timeline(doc, RHYTHMS).map((e) => e.tempo)).toEqual([140, 140, 70, null]);
  });

  test('empty blocks take no time', () => {
    const doc = parse([...block([]), '${Am}a'].join('\n')).doc;
    expect(timeline(doc, RHYTHMS).map((e) => [e.kind, e.start])).toEqual([['chord', 0]]);
  });

  test('a lyrics-only bar after a tab block takes no time, like one with no previous chord', () => {
    const doc = parse([...block(['0.6 0.6 0.6 0.6']), '| fire |'].join('\n')).doc;
    expect(timeline(doc, RHYTHMS).map((e) => [e.kind, e.start, e.length])).toEqual([['tab', 0, 1]]);
  });
});

describe('chordList', () => {
  test('unique chords in order, German H as B, non-chords dropped', () => {
    const { doc } = parse('${Am} ${Hm} ${Am} ${Xyz}\n[Припев]\n${F#m7/C#} ${Bm}');
    expect(chordList(doc)).toEqual(['Am', 'Bm', 'F#m7/C#']);
  });
});

describe('chordSpellings', () => {
  test('keeps the first spelling written in the song, keyed by the normalised chord', () => {
    const { doc } = parse('${Am} ${Hm} ${Am} ${Xyz}\n[Припев]\n${F#m7/C#} ${Bm}');
    expect([...chordSpellings(doc)]).toEqual([
      ['Am', 'Am'],
      ['Bm', 'Hm'],
      ['F#m7/C#', 'F#m7/C#'],
    ]);
  });
});

describe('lyrics', () => {
  test('text without chords, markers and tabs', () => {
    const source =
      '[Куплет] @A\n|${Am}Зачем ${G}кричать|\n${E} ${C} ${x2}\n\nпросто текст\n{start_of_tab}\ne|--|\n{end_of_tab}';
    expect(lyrics(parse(source).doc)).toBe('Зачем кричать\n\nпросто текст');
  });
});
