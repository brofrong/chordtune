import { describe, expect, test } from 'bun:test';

import { TunedTracker } from './tuned-tracker';

const FRAME_MS = 20;

/** Feeds `cents` (or silence) for `ms` starting at `from`; returns the first time a string got tuned. */
function feed(
  tracker: TunedTracker,
  from: number,
  ms: number,
  index: number | null,
  cents: (i: number) => number,
): number | null {
  let tunedAt: number | null = null;
  for (let t = from, i = 0; t < from + ms; t += FRAME_MS, i++) {
    const tuned = tracker.feed(index, cents(i), t);
    if (tuned != null && tunedAt == null) {
      tunedAt = t;
    }
  }
  return tunedAt;
}

describe('TunedTracker', () => {
  test('a steady note in the green zone is tuned after the hold time, not before', () => {
    const tracker = new TunedTracker();
    expect(feed(tracker, 0, 600, 0, () => 1)).toBeNull();
    expect(tracker.feed(0, 1, 600)).toBe(0);
  });

  test('raw readings jittering across the zone edge still count when the needle sits in green', () => {
    const jitter = [1.5, 4.2, 2, 3.6, 1.8, 4, 2.4, 3.4];
    const tracker = new TunedTracker();
    const tunedAt = feed(tracker, 0, 1000, 0, (i) => jitter[i % jitter.length] ?? 0);
    expect(tunedAt).not.toBeNull();
    expect(tunedAt ?? Infinity).toBeLessThanOrEqual(700);
  });

  test('a short dip out of the zone does not restart the hold', () => {
    const tracker = new TunedTracker();
    expect(feed(tracker, 0, 400, 0, () => 1)).toBeNull();
    expect(feed(tracker, 400, 80, 0, () => 10)).toBeNull();
    const tunedAt = feed(tracker, 480, 400, 0, () => 1);
    expect(tunedAt ?? Infinity).toBeLessThanOrEqual(700);
  });

  test('drifting out of the zone for longer restarts the hold', () => {
    const tracker = new TunedTracker();
    expect(feed(tracker, 0, 400, 0, () => 1)).toBeNull();
    expect(feed(tracker, 400, 400, 0, () => 9)).toBeNull();
    const tunedAt = feed(tracker, 800, 1000, 0, () => 1);
    // The hold starts again once the needle is back in green, so it takes a full hold time.
    expect(tunedAt ?? 0).toBeGreaterThanOrEqual(800 + 600);
  });

  test('a note far out of tune is never tuned', () => {
    const tracker = new TunedTracker();
    expect(feed(tracker, 0, 2000, 0, () => 6)).toBeNull();
  });

  test('moving to another string starts its own hold', () => {
    const tracker = new TunedTracker();
    expect(feed(tracker, 0, 400, 0, () => 0)).toBeNull();
    expect(feed(tracker, 400, 400, 1, () => 0)).toBeNull();
    expect(feed(tracker, 800, 300, 1, () => 0)).toBe(1000);
  });

  test('silence longer than a dropout restarts the hold', () => {
    const tracker = new TunedTracker();
    expect(feed(tracker, 0, 400, 0, () => 0)).toBeNull();
    expect(feed(tracker, 400, 400, null, () => 0)).toBeNull();
    expect(feed(tracker, 800, 1000, 0, () => 0)).toBe(1400);
  });

  test('a brief detection dropout does not restart the hold', () => {
    const tracker = new TunedTracker();
    expect(feed(tracker, 0, 400, 0, () => 0)).toBeNull();
    expect(feed(tracker, 400, 60, null, () => 0)).toBeNull();
    expect(feed(tracker, 460, 400, 0, () => 0)).toBe(600);
  });

  test('chromatic readings without a string are never tuned', () => {
    const tracker = new TunedTracker();
    expect(feed(tracker, 0, 2000, null, () => 0)).toBeNull();
  });
});
