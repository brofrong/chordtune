/// <reference types="bun" />

import { expect, test } from 'bun:test';

import { formatCount } from './format';

test('counts fit in three characters plus a suffix', () => {
  const cases: [number, string][] = [
    [0, '0'],
    [999, '999'],
    [1000, '1K'],
    [1234, '1.2K'],
    [9999, '9.9K'],
    [12345, '12K'],
    [999999, '999K'],
    [1000000, '1M'],
    [2512000, '2.5M'],
  ];
  for (const [n, text] of cases) {
    expect(formatCount(n)).toBe(text);
  }
});
