/** Open strings of the guitar tunings a song can be in, as MIDI notes, thickest string first. */
export const GUITAR_TUNINGS = {
  standard: [40, 45, 50, 55, 59, 64],
  'drop-d': [38, 45, 50, 55, 59, 64],
  'half-step-down': [39, 44, 49, 54, 58, 63],
  'd-standard': [38, 43, 48, 53, 57, 62],
  'drop-c': [36, 43, 48, 53, 57, 62],
  'open-g': [38, 43, 50, 55, 59, 62],
  'open-d': [38, 45, 50, 54, 57, 62],
  dadgad: [38, 45, 50, 55, 57, 62],
} as const satisfies Record<string, readonly number[]>;

export type SongTuningId = keyof typeof GUITAR_TUNINGS;

export const SONG_TUNING_IDS = Object.keys(GUITAR_TUNINGS) as SongTuningId[];

export type SongTuning = {
  id: SongTuningId;
  /** Strings that chord shapes and tab frets are read against, thickest first. */
  strings: readonly number[];
  /** Semitones the sound moves by: a tuned-down guitar plays the usual shapes lower. */
  shift: number;
};

/** Tunings written with the shapes of another: the whole neck is tuned down. */
const SHAPES_OF: Partial<Record<SongTuningId, { shapes: SongTuningId; shift: number }>> = {
  'half-step-down': { shapes: 'standard', shift: -1 },
  'd-standard': { shapes: 'standard', shift: -2 },
  'drop-c': { shapes: 'drop-d', shift: -2 },
};

export function isSongTuningId(value: unknown): value is SongTuningId {
  return typeof value === 'string' && Object.hasOwn(GUITAR_TUNINGS, value);
}

/** The song's tuning; anything unknown is standard. */
export function songTuning(id: string | null | undefined): SongTuning {
  const known = isSongTuningId(id) ? id : 'standard';
  const shapes = SHAPES_OF[known];
  return shapes
    ? { id: known, strings: GUITAR_TUNINGS[shapes.shapes], shift: shapes.shift }
    : { id: known, strings: GUITAR_TUNINGS[known], shift: 0 };
}

/** A string lower than the one before it, like the high G of a ukulele. */
export function isReentrant(strings: readonly number[]): boolean {
  return strings.some((midi, i) => i > 0 && midi < (strings[i - 1] ?? midi));
}
