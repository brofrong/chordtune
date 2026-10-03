import { GUITAR_TUNINGS, SONG_TUNING_IDS } from '@chordtune/chord-sheet';

import { centsBetween, DEFAULT_A4_HZ, midiToHz, midiToNoteName } from './pitch';

export type InstrumentId = 'guitar' | 'bass' | 'ukulele' | 'chromatic';

export type Tuning = {
  id: string;
  instrument: InstrumentId;
  /** Open strings as MIDI notes, in the order they sit on the neck (ukulele is re-entrant). */
  strings: readonly number[];
};

export type Instrument = {
  id: InstrumentId;
  minHz: number;
  maxHz: number;
  tunings: readonly Tuning[];
};

const tuning = (instrument: InstrumentId, id: string, strings: number[]): Tuning => ({
  id,
  instrument,
  strings,
});

export const INSTRUMENTS: readonly Instrument[] = [
  {
    id: 'guitar',
    minHz: 60,
    maxHz: 1200,
    tunings: SONG_TUNING_IDS.map((id) => tuning('guitar', id, [...GUITAR_TUNINGS[id]])),
  },
  {
    id: 'bass',
    minHz: 28,
    maxHz: 600,
    tunings: [
      tuning('bass', 'standard', [28, 33, 38, 43]),
      tuning('bass', 'drop-d', [26, 33, 38, 43]),
      tuning('bass', 'five-string', [23, 28, 33, 38, 43]),
    ],
  },
  {
    id: 'ukulele',
    minHz: 120,
    maxHz: 1400,
    tunings: [
      tuning('ukulele', 'standard', [67, 60, 64, 69]),
      tuning('ukulele', 'low-g', [55, 60, 64, 69]),
      tuning('ukulele', 'baritone', [50, 55, 59, 64]),
    ],
  },
  {
    id: 'chromatic',
    minHz: 40,
    maxHz: 1600,
    tunings: [tuning('chromatic', 'chromatic', [])],
  },
];

export const DEFAULT_TUNING = INSTRUMENTS[0]?.tunings[0] as Tuning;

export function getInstrument(id: InstrumentId): Instrument {
  return INSTRUMENTS.find((instrument) => instrument.id === id) ?? (INSTRUMENTS[0] as Instrument);
}

export function findTuning(instrument: InstrumentId, tuningId: string): Tuning {
  const found = getInstrument(instrument).tunings.find((item) => item.id === tuningId);
  return found ?? (getInstrument(instrument).tunings[0] as Tuning);
}

export function stringLabel(midi: number): string {
  const { name, octave } = midiToNoteName(midi);
  return `${name}${octave}`;
}

export type StringMatch = {
  index: number;
  midi: number;
  targetHz: number;
  cents: number;
};

export function nearestString(
  frequency: number,
  strings: readonly number[],
  a4 = DEFAULT_A4_HZ,
): StringMatch | null {
  let best: StringMatch | null = null;
  for (let index = 0; index < strings.length; index++) {
    const midi = strings[index] as number;
    const targetHz = midiToHz(midi, a4);
    const cents = centsBetween(frequency, targetHz);
    if (best == null || Math.abs(cents) < Math.abs(best.cents)) {
      best = { index, midi, targetHz, cents };
    }
  }
  return best;
}

export function stringTarget(
  frequency: number,
  strings: readonly number[],
  index: number,
  a4 = DEFAULT_A4_HZ,
): StringMatch | null {
  const midi = strings[index];
  if (midi == null) {
    return null;
  }
  const targetHz = midiToHz(midi, a4);
  return { index, midi, targetHz, cents: centsBetween(frequency, targetHz) };
}

/** Smallest power-of-two window that holds two periods of the lowest note, so YIN can see it. */
export function analysisWindowSize(sampleRate: number, minHz: number): number {
  const needed = (2 * sampleRate) / minHz;
  let size = 2048;
  while (size < needed && size < 16384) {
    size *= 2;
  }
  return size;
}
