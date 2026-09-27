/** Longest step the clock takes per frame, so time spent in the background is not skipped. */
const MAX_FRAME_MS = 250;

export function advanceClock(seconds: number, frameMs: number): number {
  return seconds + Math.min(frameMs, MAX_FRAME_MS) / 1000;
}
