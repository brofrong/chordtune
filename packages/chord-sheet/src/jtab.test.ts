import { describe, expect, test } from 'bun:test';

import { parseAlphaTex } from './alphatex';
import { jtabToAlphaTex } from './jtab';

describe('jtabToAlphaTex', () => {
  test('even bars become eighth notes, one output line per jtab line', () => {
    const source = [
      '$5 0 $3 5 $2 8 $5 0 $3 5 $2 5 $5 0 $3 5 | $2 6 $5 0 $3 5 $2 5 $5 0 $3 5 $2 5 $3 5 |',
      '',
      '$4 3 $3 5 $1 3 $4 3 $3 5 $2 5 $4 3 $3 5 |',
    ].join('\n');
    const lines = jtabToAlphaTex(source);
    expect(lines).toEqual([
      ':8 0.5 5.3 8.2 0.5 5.3 5.2 0.5 5.3 | 6.2 0.5 5.3 5.2 0.5 5.3 5.2 5.3 |',
      '3.4 5.3 3.1 3.4 5.3 5.2 3.4 5.3 |',
    ]);
    expect(parseAlphaTex(lines ?? []).diagnostics).toEqual([]);
  });

  test('uneven bars or foreign tokens are not converted', () => {
    expect(jtabToAlphaTex('$5 0 $3 5 | $2 6 $5 0 $3 5 |')).toBeNull();
    expect(jtabToAlphaTex('$5 0 $3 5 $2 8')).toBeNull();
    expect(jtabToAlphaTex('Am G | $5 0')).toBeNull();
    expect(jtabToAlphaTex('')).toBeNull();
  });
});
