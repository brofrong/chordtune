import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { fromChordsOverLyrics, isChordLine, toChordsOverLyrics } from './chords-over-lyrics';
import { serialize } from './serialize';

const FIXTURES = join(import.meta.dir, '../fixtures/obsidian');

function chordsBlocks(fileName: string): string {
  const markdown = readFileSync(join(FIXTURES, fileName), 'utf8');
  return [...markdown.matchAll(/```chords\n([\s\S]*?)```/g)].map((m) => m[1]).join('\n');
}

describe('isChordLine', () => {
  test('chords, bars, markers and repeats', () => {
    for (const line of ['Am  G', 'E C#m G# A }x4', '| Am G | F |', '@B Dm', 'G (x2)', '  Hm7/F#']) {
      expect(isChordLine(line)).toBe(true);
    }
  });

  test('lyrics, tabs and marker-only lines are not chord lines', () => {
    for (const line of [
      'A little bird',
      'E||---0---||',
      '',
      'x4',
      '@A',
      '[Куплет]',
      'Cm (x3, short)',
    ]) {
      expect(isChordLine(line)).toBe(false);
    }
  });
});

describe('fromChordsOverLyrics', () => {
  test('chords land on the letters below them', () => {
    const { doc } = fromChordsOverLyrics(chordsBlocks('Radiohead - Creep.md'));
    const verse = doc.sections.find((section) => section.label === 'Куплет 1');
    expect(serialize({ meta: {}, sections: verse ? [verse] : [] }).split('\n')[1]).toBe(
      "When you were here be${G}fore, couldn't look you in the ${B}eyes",
    );
  });

  test('a chord line without lyrics keeps its columns as spaces', () => {
    const { doc } = fromChordsOverLyrics('E  C#m G# A }x4');
    expect(doc.sections[0]?.lines[0]).toEqual({
      type: 'line',
      items: [
        { type: 'chord', chord: 'E' },
        { type: 'text', text: '   ' },
        { type: 'chord', chord: 'C#m' },
        { type: 'text', text: '    ' },
        { type: 'chord', chord: 'G#' },
        { type: 'text', text: '   ' },
        { type: 'chord', chord: 'A' },
        { type: 'text', text: '  ' },
        { type: 'repeat', times: 4 },
      ],
    });
  });

  test('a chord past the end of the lyric pads it', () => {
    const { doc } = fromChordsOverLyrics('Am     G\nla');
    expect(serialize(doc)).toBe('${Am}la     ${G}');
  });

  test('tab lines become a tab block', () => {
    const { doc } = fromChordsOverLyrics(chordsBlocks('Noize MC - Кошка.md'));
    const coda = doc.sections.find((section) => section.label === 'Кода');
    const tabs = coda?.lines.filter((line) => line.type === 'tab') ?? [];
    expect(tabs).toHaveLength(3);
    const tabLines = tabs.map((tab) => (tab.type === 'tab' ? tab.lines : []));
    expect(tabLines.map((lines) => lines.length)).toEqual([6, 6, 6]);
    expect(tabLines[0]?.[1]).toStartWith('H||');
  });

  test('headers keep their rhythm marker', () => {
    const { doc } = fromChordsOverLyrics('[Припев] @B\nDm\nЧто ей снится');
    expect(doc.sections[0]).toMatchObject({ label: 'Припев', rhythm: 'B' });
  });
});

describe('toChordsOverLyrics', () => {
  test('crowded chords move right by one space', () => {
    const { doc } = fromChordsOverLyrics('');
    doc.sections = [
      {
        label: null,
        rhythm: null,
        lines: [
          {
            type: 'line',
            items: [
              { type: 'chord', chord: 'F#m7' },
              { type: 'text', text: 'la' },
              { type: 'chord', chord: 'G' },
              { type: 'text', text: 'la' },
            ],
          },
        ],
      },
    ];
    expect(toChordsOverLyrics(doc)).toBe('F#m7 G\nlala');
  });

  test('is stable after the first pass on every fixture', () => {
    for (const fileName of readdirSync(FIXTURES)) {
      const once = toChordsOverLyrics(fromChordsOverLyrics(chordsBlocks(fileName)).doc);
      const twice = toChordsOverLyrics(fromChordsOverLyrics(once).doc);
      expect(twice).toBe(once);
    }
  });

  test('keeps a clean chord sheet as is', () => {
    const text = [
      '[Куплет 1] @B',
      'Am        G                  F',
      'Зачем кричать, когда никто не слышит',
      'G B C Cm x4',
      '',
      '| Am G | F |',
    ].join('\n');
    expect(toChordsOverLyrics(fromChordsOverLyrics(text).doc)).toBe(text);
  });
});
