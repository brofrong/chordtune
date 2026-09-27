/// <reference types="bun" />

import { expect, test } from 'bun:test';

import { coverColors, initials } from './cover';

test('the same artist always gets the same cover', () => {
  expect(coverColors('LUMEN')).toEqual(coverColors('LUMEN'));
});

test('artists spread over the palette', () => {
  const names = [
    'LUMEN',
    'Noize MC',
    'Radiohead',
    'Pixies',
    'Кино',
    'Сектор Газа',
    'Сплин',
    'ДДТ',
    'Muse',
    'Nirvana',
  ];
  const pairs = new Set(names.map((name) => coverColors(name).join()));
  expect(pairs.size).toBeGreaterThanOrEqual(3);
});

test('initials: first letters of two words, or the first two letters of one', () => {
  expect(initials('Noize MC')).toBe('NM');
  expect(initials('LUMEN')).toBe('LU');
  expect(initials('Сектор Газа')).toBe('СГ');
  expect(initials('  кино ')).toBe('КИ');
});
