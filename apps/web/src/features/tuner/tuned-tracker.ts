import { IN_TUNE_CENTS } from './reading';

/** How long a string must stay in the green zone to get its tick. */
const TUNED_AFTER_MS = 600;
/** Time constant of the smoothing, close to how the needle settles. */
const SMOOTHING_MS = 120;
/** A dip out of the zone (or a detection dropout) shorter than this keeps the hold going. */
const GRACE_MS = 200;

/**
 * Decides when a string counts as tuned. Raw readings jitter by a few cents and a plucked string
 * starts slightly sharp, so the decision follows a smoothed value — what the needle shows — and
 * forgives short dips instead of restarting the hold on every stray frame.
 */
export class TunedTracker {
  private index: number | null = null;
  private smoothed = 0;
  private lastAt = 0;
  private inSince: number | null = null;
  private outSince: number | null = null;

  /**
   * Feeds one reading (`index` null: silence or no string to tune against). Returns the string
   * index while it has held the green zone long enough, otherwise null.
   */
  feed(index: number | null, cents: number, now: number): number | null {
    if (index == null) {
      this.leaveZone(now);
      return null;
    }
    if (index !== this.index) {
      this.index = index;
      this.smoothed = cents;
      this.inSince = null;
      this.outSince = null;
    } else {
      const alpha = 1 - Math.exp(-(now - this.lastAt) / SMOOTHING_MS);
      this.smoothed += alpha * (cents - this.smoothed);
    }
    this.lastAt = now;

    if (Math.abs(this.smoothed) > IN_TUNE_CENTS) {
      this.leaveZone(now);
      return null;
    }
    this.outSince = null;
    this.inSince ??= now;
    return now - this.inSince >= TUNED_AFTER_MS ? index : null;
  }

  private leaveZone(now: number) {
    if (this.inSince == null) {
      return;
    }
    this.outSince ??= now;
    if (now - this.outSince >= GRACE_MS) {
      this.inSince = null;
      this.outSince = null;
    }
  }
}
