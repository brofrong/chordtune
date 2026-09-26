import { describe, expect, test } from 'bun:test';

import { otherScript, slugify, toCyrillic, toLatin } from './translit';

describe('translit', () => {
  test('Cyrillic to Latin', () => {
    expect(toLatin('лумен')).toBe('lumen');
    expect(toLatin('нойз')).toBe('noiz');
    expect(toLatin('Сектор Газа — Щека, Жук и Юла')).toBe('Sektor Gaza — Scheka, Zhuk i Yula');
    expect(toLatin('Кино')).toBe('Kino');
  });

  test('Latin to Cyrillic', () => {
    expect(toCyrillic('lumen')).toBe('лумен');
    expect(toCyrillic('Noize MC')).toBe('Ноизе МК');
    expect(toCyrillic('shchuka zhuk chay yasha')).toBe('щука жук чаи яша');
  });

  test('otherScript picks the direction by the letters present', () => {
    expect(otherScript('LUMEN')).toBe('ЛУМЕН');
    expect(otherScript('лумен')).toBe('lumen');
    expect(otherScript('123')).toBe('123');
  });

  test('slugify', () => {
    expect(slugify('Noize MC')).toBe('noize-mc');
    expect(slugify('Сектор Газа')).toBe('sektor-gaza');
    expect(slugify('  Where Is My Mind?! ')).toBe('where-is-my-mind');
    expect(slugify('Кошка')).toBe('koshka');
    expect(slugify('Ёлка')).toBe('elka');
    expect(slugify('★')).toBe('');
  });
});
