import { expect, test } from 'bun:test';

import { createThrottle } from './throttle';

test('runs at once, then at most once more at the end of the window, per key', async () => {
  const calls: string[] = [];
  const throttle = createThrottle(40);
  throttle('a', () => calls.push('a1'));
  throttle('a', () => calls.push('a2'));
  throttle('a', () => calls.push('a3'));
  throttle('b', () => calls.push('b1'));
  expect(calls).toEqual(['a1', 'b1']);
  await Bun.sleep(70);
  expect(calls).toEqual(['a1', 'b1', 'a3']);
  throttle('a', () => calls.push('a4'));
  await Bun.sleep(70);
  expect(calls).toEqual(['a1', 'b1', 'a3', 'a4']);
});
