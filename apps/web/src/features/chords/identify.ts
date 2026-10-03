import { findTuning, type InstrumentId, type Tuning } from '@chordtune/audio';
import { isReentrant, nameChord, noteName, shapeMidis } from '@chordtune/chord-sheet';

const MAX_NAMES = 3;

export type Identified =
  | { kind: 'empty' }
  | { kind: 'note'; notes: string[] }
  | { kind: 'interval'; notes: string[]; semitones: number }
  | { kind: 'chord'; notes: string[]; names: string[] }
  | { kind: 'unknown'; notes: string[] };

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
  if (names.length > 0) {
    return { kind: 'chord', notes, names };
  }
  if (notes.length === 2) {
    const lowest = midis[0] ?? 0;
    const other = midis.find((midi) => (midi - lowest) % 12 !== 0) ?? lowest;
    return { kind: 'interval', notes, semitones: (((other - lowest) % 12) + 12) % 12 };
  }
  return { kind: 'unknown', notes };
}

export const CHORD_INSTRUMENTS: readonly InstrumentId[] = ['guitar', 'bass', 'ukulele'];

/** The tuner's instrument and tuning, as strings to press; chromatic falls back to guitar. */
export function chordInstrument(instrument: InstrumentId, tuningId: string): Tuning {
  // An unknown tuning id falls back to the instrument's first tuning (guitar: standard).
  return findTuning(CHORD_INSTRUMENTS.includes(instrument) ? instrument : 'guitar', tuningId);
}
