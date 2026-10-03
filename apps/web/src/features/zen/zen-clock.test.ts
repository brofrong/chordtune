/// <reference types="bun" />

import { expect, test } from 'bun:test';

import { advanceClock } from './zen-clock';

test('a normal frame advances by its length', () => {
  expect(advanceClock(10, 16)).toBeCloseTo(10.016, 9);
});

test('coming back after minutes in the background does not jump ahead', () => {
  expect(advanceClock(10, 180_000)).toBeCloseTo(10.25, 9);
});

test('speed makes song time run faster or slower', () => {
  expect(advanceClock(1, 100, 1.5)).toBeCloseTo(1.15, 9);
  expect(advanceClock(1, 100, 0.5)).toBeCloseTo(1.05, 9);
});
