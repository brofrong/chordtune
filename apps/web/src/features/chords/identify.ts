import { findTuning, type InstrumentId, type Tuning } from '@chordtune/audio';
import { isReentrant, nameChord, noteName, shapeMidis } from '@chordtune/chord-sheet';

const MAX_NAMES = 3;

export type Identified =
  | { kind: 'empty' }
  | { kind: 'note'; notes: string[] }
  | { kind: 'interval'; notes: string[]; semitones: number; names: string[] }
  | { kind: 'chord'; notes: string[]; names: string[] }
  | { kind: 'unknown'; notes: string[] };

// Two notes a fourth (or any non-fifth interval) apart only ever match the slash-spelled power
// chord quality from the upper note's perspective, e.g. `A5/E` for E and A: an inverted fifth,
// not a chord anyone asked for. Root-position fifths (`E5`, no slash) stay chords.
const INVERTED_FIFTH = /^[A-H][#b]?5\/[A-H][#b]?$/;

/** What pressed frets make: a note, an interval, a chord (with alternatives) or nothing known. */
export function identify(
  frets: readonly (number | null)[],
  strings: readonly number[],
): Identified {
  const midis = shapeMidis(frets.slice(0, strings.length), strings).sort((a, b) => a - b);
  if (midis.length === 0) {
    return { kind: 'empty' };
  }
  const notes = [...new Set(midis.map(noteName))];
  if (notes.length === 1) {
    return { kind: 'note', notes };
  }
  const names = nameChord(midis, { ignoreBass: isReentrant(strings) }).slice(0, MAX_NAMES);
  const invertedFifth = notes.length === 2 && names.length === 1 && INVERTED_FIFTH.test(names[0]);
  if (names.length > 0 && !invertedFifth) {
    return { kind: 'chord', notes, names };
  }
  if (notes.length === 2) {
    const lowest = midis[0] ?? 0;
    const other = midis.find((midi) => (midi - lowest) % 12 !== 0) ?? lowest;
    const semitones = (((other - lowest) % 12) + 12) % 12;
    return { kind: 'interval', notes, semitones, names: invertedFifth ? names : [] };
  }
  return { kind: 'unknown', notes };
}

export const CHORD_INSTRUMENTS: readonly InstrumentId[] = ['guitar', 'bass', 'ukulele'];

/** The tuner's instrument and tuning, as strings to press; chromatic falls back to guitar. */
export function chordInstrument(instrument: InstrumentId, tuningId: string): Tuning {
  // An unknown tuning id falls back to the instrument's first tuning (guitar: standard).
  return findTuning(CHORD_INSTRUMENTS.includes(instrument) ? instrument : 'guitar', tuningId);
}
