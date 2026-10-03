import { voicingsFor } from '@chordtune/audio';
import type { Shape } from '@chordtune/chord-sheet';

/** Shapes to page through for a chord: the author's first, then the suggested ones without it. */
export function chordVariants(
  chord: string,
  strings: readonly number[],
  authorShape?: Shape,
): Shape[] {
  const suggested = voicingsFor(chord, strings).map((voicing) => [...voicing.frets]);
  if (!authorShape) {
    return suggested;
  }
  const id = authorShape.join();
  return [authorShape, ...suggested.filter((shape) => shape.join() !== id)];
}
