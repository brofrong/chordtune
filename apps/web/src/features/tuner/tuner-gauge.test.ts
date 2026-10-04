import { describe, expect, test } from 'bun:test';

import { polar } from './tuner-gauge';

describe('polar', () => {
  test('coordinates are rounded, so server and browser render the same attributes', () => {
    // Math.sin/cos may differ in the last bit between engines, which broke hydration.
    for (const cents of [-50, -45, -12.5, 0, 7, 33, 50]) {
      for (const radius of [92, 116, 131, 138, 160]) {
        const { x, y } = polar(cents, radius);
        expect(Math.round(x * 100) / 100).toBe(x);
        expect(Math.round(y * 100) / 100).toBe(y);
      }
    }
  });

  test('the centre of the scale points straight up', () => {
    expect(polar(0, 146)).toEqual({ x: 160, y: 22 });
  });
});
