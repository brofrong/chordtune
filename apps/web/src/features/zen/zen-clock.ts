/** Longest step the clock takes per frame, so time spent in the background is not skipped. */
const MAX_FRAME_MS = 250;

/** Song time after a frame; `speed` is the playback speed (1.5 plays half again as fast). */
export function advanceClock(seconds: number, frameMs: number, speed = 1): number {
  return seconds + (Math.min(frameMs, MAX_FRAME_MS) / 1000) * speed;
}
