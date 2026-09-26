import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { importObsidian } from './import-obsidian';
import { parse } from './parse';
import { strumSymbols } from './rhythm';
import { serialize } from './serialize';
import type { SongDoc } from './types';

const FIXTURES = join(import.meta.dir, '../fixtures/obsidian');

function load(fileName: string) {
  return importObsidian(readFileSync(join(FIXTURES, fileName), 'utf8'), fileName);
}

function chords(doc: SongDoc): string[] {
  const found = new Set<string>();
  for (const section of doc.sections) {
    for (const line of section.lines) {
      if (line.type === 'line') {
        for (const item of line.items) {
          if (item.type === 'chord') {
            found.add(item.chord);
          }
        }
      }
    }
  }
  return [...found];
}

function sectionRhythms(doc: SongDoc) {
  return doc.sections.map((section) => [section.label, section.rhythm]);
}

describe('importObsidian', () => {
  test('Creep: title from the heading, no rhythm, source link in notes', () => {
    const song = load('Radiohead - Creep.md');
    expect(song).toMatchObject({ artist: 'Radiohead', title: 'Creep', capo: null, tempo: null });
    expect(song.rhythms).toEqual([]);
    expect(chords(parse(song.content).doc)).toEqual(['G', 'B', 'C', 'Cm']);
    expect(song.notes).toContain('src: [Radiohead - Creep]');
    expect(song.notes).not.toContain('Паттерн');
  });

  test('Кошка: chords and tab blocks', () => {
    const song = load('Noize MC - Кошка.md');
    expect(song).toMatchObject({ artist: 'Noize MC', title: 'Кошка' });
    const { doc } = parse(song.content);
    expect(chords(doc)).toEqual(['Dm', 'A#', 'F', 'A7', 'Gm']);
    const coda = doc.sections.find((section) => section.label === 'Кода');
    expect(coda?.lines.filter((line) => line.type === 'tab')).toHaveLength(3);
  });

  test('Where Is My Mind: accented strum and a repeated intro', () => {
    const song = load('Pixies - Where Is My Mind.md');
    expect(song.tempo).toBeNull();
    expect(song.rhythms).toHaveLength(1);
    expect(song.rhythms[0]).toMatchObject({ key: 'A', kind: 'strum' });
    expect(song.rhythms[0]?.steps.filter((step) => step?.accent)).toHaveLength(3);
    const intro = parse(song.content).doc.sections[0];
    expect(intro?.label).toBe('вступление');
    const first = intro?.lines[0];
    expect(first?.type === 'line' && first.items.at(-1)).toEqual({ type: 'repeat', times: 4 });
  });

  test('Гореть: title from the file name, rhythm from [бой:], bars in the outro', () => {
    const song = load('LUMEN - Гореть.md');
    expect(song).toMatchObject({ artist: 'LUMEN', title: 'Гореть' });
    expect(song.rhythms).toHaveLength(1);
    expect(strumSymbols(song.rhythms[0]!).join('')).toBe('↓↓↑↑↓↓↑↓↑');
    const { doc } = parse(song.content);
    expect(doc.sections.map((section) => section.label)).not.toContain('бой:');
    const outro = doc.sections.find((section) => section.label === 'outro');
    const line = outro?.lines[0];
    expect(line?.type === 'line' && line.items.some((item) => item.type === 'bar')).toBe(true);
    expect(song.notes).toContain('```jtab');
    expect(song.notes).toContain('**Проигрыш**');
  });

  test('Лирика: section lines, pick by default, strum on choruses', () => {
    const song = load('Сектор Газа — Лирика.md');
    expect(song).toMatchObject({ artist: 'Сектор Газа', title: 'Лирика' });
    expect(song.rhythms.map((rhythm) => [rhythm.key, rhythm.name])).toEqual([
      ['A', 'Перебор «восьмёрка»'],
      ['B', 'Бой'],
    ]);
    expect(strumSymbols(song.rhythms[1]!).join(' ')).toBe('↓ ↓ ↓ ↓ ↑');
    const { doc } = parse(song.content);
    expect(sectionRhythms(doc)).toEqual([
      ['Вступление', null],
      ['Куплет 1', null],
      ['Припев', 'B'],
      ['Куплет 2', 'A'],
      ['Припев', 'B'],
      ['Соло', 'A'],
      ['Куплет 3', null],
      ['Припев', 'B'],
    ]);
    expect(chords(doc).slice(0, 3)).toEqual(['F#m', 'E', 'Bm']);
    expect(song.content).toContain('[Соло] @A\n${A}');
  });

  test('capo and tempo', () => {
    const song = importObsidian(
      '#A - B\nКаподастр: 4 лад\nBPM: 96\nПаттерн: шестёрка (Каподастр: 3 лад)\n```chords\nAm\nla\n```',
    );
    expect(song).toMatchObject({ artist: 'A', title: 'B', capo: 3, tempo: 96 });
    expect(song.rhythms[0]?.name).toBe('Шестёрка');
  });

  test('unparsed rhythm notes are kept', () => {
    const song = importObsidian('#A - B\nПеребор: см. табы и ноты\n```chords\nAm\n```');
    expect(song.rhythms).toEqual([]);
    expect(song.notes).toBe('Перебор: см. табы и ноты');
  });

  test('imported content round-trips through the parser', () => {
    for (const fileName of readdirSync(FIXTURES)) {
      const song = load(fileName);
      const { doc, diagnostics } = parse(song.content);
      expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
      expect(song.diagnostics).toEqual([]);
      expect(parse(song.content).doc).toEqual(doc);
      expect(serialize(doc)).toBe(song.content);
    }
  });
});
