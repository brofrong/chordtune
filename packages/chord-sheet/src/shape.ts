import { parseChord } from './chord';

/** Frets of a chord shape, thickest string first; `null` is a string that does not sound. */
export type Shape = (number | null)[];

/** The author's shapes, keyed by `chordKey`. */
export type Voicings = Record<string, Shape>;

export const MAX_SHAPE_FRET = 24;

/** `Hm` → `Bm`, `F#m7/C#` as is; null when it is not a chord. Chords are keyed by it song-wide. */
export function chordKey(raw: string): string | null {
  const chord = parseChord(raw);
  return chord ? `${chord.root}${chord.suffix}${chord.bass ? `/${chord.bass}` : ''}` : null;
}

export function isShape(value: unknown, stringCount: number): value is Shape {
  return (
    Array.isArray(value) &&
    value.length === stringCount &&
    value.every(
      (fret) => fret === null || (Number.isInteger(fret) && fret >= 0 && fret <= MAX_SHAPE_FRET),
    ) &&
    value.some((fret) => fret !== null)
  );
}

/** Keeps the entries keyed by a normalised chord with a valid shape. */
export function sanitizeVoicings(value: unknown, stringCount: number): Voicings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([chord, shape]) => chordKey(chord) === chord && isShape(shape, stringCount),
    ),
  ) as Voicings;
}

/** MIDI notes a shape sounds, thickest string first. */
export function shapeMidis(
  shape: readonly (number | null)[],
  strings: readonly number[],
  capo = 0,
): number[] {
  return shape.flatMap((fret, i) => (fret === null ? [] : [(strings[i] ?? 0) + fret + capo]));
}
