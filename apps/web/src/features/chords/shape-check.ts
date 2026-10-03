import { nameChord, playsChord, shapeMidis } from '@chordtune/chord-sheet';

export type ShapeCheck =
  | { kind: 'match' }
  | { kind: 'other'; name: string }
  | { kind: 'unknown' }
  | { kind: 'empty' };

/** Whether a drawn shape plays `chord`, and if not, what it sounds like. */
export function checkShape(
  shape: readonly (number | null)[],
  chord: string,
  strings: readonly number[],
): ShapeCheck {
  const midis = shapeMidis(shape, strings);
  if (midis.length === 0) {
    return { kind: 'empty' };
  }
  if (playsChord(midis, chord)) {
    return { kind: 'match' };
  }
  const name = nameChord(midis)[0];
  return name ? { kind: 'other', name } : { kind: 'unknown' };
}
