import { describe, expect, test } from 'bun:test';

import { parse } from './parse';
import { serialize } from './serialize';
import { validate } from './validate';

const EXAMPLE = [
  '{key: Am}',
  '[Куплет 1] @B',
  '|${Am}Зачем кричать, ${G}когда никто не ${F}слышит|',
  '${G} ${B} ${C} ${Cm} ${x4}',
  '@A ${Dm}Что ей снится…',
  '{start_of_tab}',
  'e|---0---|',
  '{end_of_tab}',
  '',
  'просто текст',
].join('\n');

describe('parse', () => {
  test('example document', () => {
    const { doc, diagnostics } = parse(EXAMPLE);
    expect(diagnostics).toEqual([]);
    expect(doc).toEqual({
      meta: { key: 'Am' },
      sections: [
        {
          label: 'Куплет 1',
          rhythm: 'B',
          lines: [
            {
              type: 'line',
              items: [
                { type: 'bar' },
                { type: 'chord', chord: 'Am' },
                { type: 'text', text: 'Зачем кричать, ' },
                { type: 'chord', chord: 'G' },
                { type: 'text', text: 'когда никто не ' },
                { type: 'chord', chord: 'F' },
                { type: 'text', text: 'слышит' },
                { type: 'bar' },
              ],
            },
            {
              type: 'line',
              items: [
                { type: 'chord', chord: 'G' },
                { type: 'text', text: ' ' },
                { type: 'chord', chord: 'B' },
                { type: 'text', text: ' ' },
                { type: 'chord', chord: 'C' },
                { type: 'text', text: ' ' },
                { type: 'chord', chord: 'Cm' },
                { type: 'text', text: ' ' },
                { type: 'repeat', times: 4 },
              ],
            },
            {
              type: 'line',
              items: [
                { type: 'rhythm', key: 'A' },
                { type: 'text', text: ' ' },
                { type: 'chord', chord: 'Dm' },
                { type: 'text', text: 'Что ей снится…' },
              ],
            },
            { type: 'tab', lines: ['e|---0---|'] },
            { type: 'line', items: [] },
            { type: 'line', items: [{ type: 'text', text: 'просто текст' }] },
          ],
        },
      ],
    });
  });

  test('lines before the first header go to an unlabeled section', () => {
    const { doc } = parse('intro\n[Chorus]\n${C}la');
    expect(doc.sections.map((section) => section.label)).toEqual([null, 'Chorus']);
    expect(doc.sections[0]?.lines).toEqual([
      { type: 'line', items: [{ type: 'text', text: 'intro' }] },
    ]);
  });

  test('rhythm markers stick to words and × repeats', () => {
    const { doc } = parse('@Bзачем ${Am}x ${×2}');
    expect(doc.sections[0]?.lines[0]).toEqual({
      type: 'line',
      items: [
        { type: 'rhythm', key: 'B' },
        { type: 'text', text: 'зачем ' },
        { type: 'chord', chord: 'Am' },
        { type: 'text', text: 'x ' },
        { type: 'repeat', times: 2 },
      ],
    });
  });

  test('warning on a non-chord, errors on unclosed brace and tab', () => {
    const { doc, diagnostics } = parse('${Xyz} ok\nbad ${Am\n{start_of_tab}\ne|--|');
    expect(diagnostics).toEqual([
      { line: 1, col: 1, severity: 'warning', message: 'Not a chord: Xyz' },
      { line: 2, col: 5, severity: 'error', message: 'Unclosed ${' },
      { line: 3, col: 1, severity: 'error', message: 'Unclosed {start_of_tab}' },
    ]);
    const lines = doc.sections[0]?.lines;
    expect(lines?.[0]).toEqual({
      type: 'line',
      items: [
        { type: 'chord', chord: 'Xyz' },
        { type: 'text', text: ' ok' },
      ],
    });
    expect(lines?.[1]).toEqual({ type: 'line', items: [{ type: 'text', text: 'bad ${Am' }] });
    expect(lines?.[2]).toEqual({ type: 'tab', lines: ['e|--|'] });
  });

  test('never throws', () => {
    for (const source of ['', '\n', '[', '${', '@', '{', '{start_of_tab}', '[]', '${}', '|||']) {
      expect(() => parse(source)).not.toThrow();
    }
  });
});

describe('serialize', () => {
  test('round-trips the example', () => {
    expect(serialize(parse(EXAMPLE).doc)).toBe(EXAMPLE);
  });

  test('round-trips edge cases', () => {
    for (const source of ['', '\n', 'text\n', '[A]\n\n[B] @C\n${D}', '|${Am}|${C} ${D}|']) {
      expect(serialize(parse(source).doc)).toBe(source);
    }
  });
});

describe('validate', () => {
  test('error on a rhythm marker without a pattern', () => {
    const { doc } = parse('[Куплет] @B\n${Am}a @C${G}b\n@A ${F}');
    expect(validate(doc, [{ key: 'A' }])).toEqual([
      { line: 1, col: 10, severity: 'error', message: 'Unknown rhythm: B' },
      { line: 2, col: 8, severity: 'error', message: 'Unknown rhythm: C' },
    ]);
  });
});
