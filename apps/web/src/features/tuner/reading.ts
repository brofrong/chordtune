import {
  type NoteMatch,
  nearestString,
  stringLabel,
  stringTarget,
  type TunerFrame,
  type Tuning,
} from '@chordtune/audio';

export const IN_TUNE_CENTS = 3;
export const NEAR_CENTS = 12;
export const GAUGE_RANGE_CENTS = 50;

export type TuneZone = 'in' | 'near' | 'off';

export type Reading = {
  frequency: number;
  note: NoteMatch;
  /** String the needle measures against; null in chromatic mode. */
  targetIndex: number | null;
  targetLabel: string;
  cents: number;
};

export function computeReading(
  frame: TunerFrame,
  tuning: Tuning,
  lockedIndex: number | null,
  a4: number,
): Reading | null {
  const { frequency, note } = frame;
  if (frequency == null || note == null) {
    return null;
  }

  if (tuning.strings.length === 0) {
    return {
      frequency,
      note,
      targetIndex: null,
      targetLabel: `${note.name}${note.octave}`,
      cents: note.cents,
    };
  }

  const match =
    lockedIndex == null
      ? nearestString(frequency, tuning.strings, a4)
      : stringTarget(frequency, tuning.strings, lockedIndex, a4);
  if (match == null) {
    return null;
  }

  return {
    frequency,
    note,
    targetIndex: match.index,
    targetLabel: stringLabel(match.midi),
    cents: match.cents,
  };
}

export function tuneZone(cents: number): TuneZone {
  const amount = Math.abs(cents);
  if (amount <= IN_TUNE_CENTS) {
    return 'in';
  }
  return amount <= NEAR_CENTS ? 'near' : 'off';
}
