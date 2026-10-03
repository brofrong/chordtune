import { chordTones, parseChord } from './chord';

/** Pitch class names, C = 0, with the flats guitarists usually read. */
export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'Eb',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'Bb',
  'B',
] as const;

/** Qualities the namer knows, simplest first; intervals in semitones above the root. */
const QUALITIES: readonly { suffix: string; intervals: readonly number[] }[] = [
  { suffix: '', intervals: [0, 4, 7] },
  { suffix: 'm', intervals: [0, 3, 7] },
  { suffix: '5', intervals: [0, 7] },
  { suffix: '7', intervals: [0, 4, 7, 10] },
  { suffix: 'm7', intervals: [0, 3, 7, 10] },
  { suffix: 'maj7', intervals: [0, 4, 7, 11] },
  { suffix: 'sus2', intervals: [0, 2, 7] },
  { suffix: 'sus4', intervals: [0, 5, 7] },
  { suffix: '6', intervals: [0, 4, 7, 9] },
  { suffix: 'm6', intervals: [0, 3, 7, 9] },
  { suffix: 'dim', intervals: [0, 3, 6] },
  { suffix: 'dim7', intervals: [0, 3, 6, 9] },
  { suffix: 'm7b5', intervals: [0, 3, 6, 10] },
  { suffix: 'aug', intervals: [0, 4, 8] },
  { suffix: 'add9', intervals: [0, 2, 4, 7] },
  { suffix: '9', intervals: [0, 2, 4, 7, 10] },
  { suffix: '7sus4', intervals: [0, 5, 7, 10] },
];

export const CHORD_SUFFIXES = QUALITIES.map((quality) => quality.suffix);

// Exactness beats slash beats rank: no-fifth penalty > slash penalty + rank spread.
const NO_FIFTH_PENALTY = 40;
const SLASH_PENALTY = 20;

const pitchClassOf = (midi: number) => ((midi % 12) + 12) % 12;

export function noteName(midi: number): string {
  return NOTE_NAMES[pitchClassOf(midi)] ?? '';
}

function sameSet(set: ReadonlySet<number>, list: readonly number[]): boolean {
  return set.size === list.length && list.every((value) => set.has(value));
}

/**
 * What chord the notes make, most likely first: `['Am', 'C6/A']`. Every note may be the root;
 * the fifth may be missing from chords of four notes or more; the lowest note is the bass, so a
 * bass that is not the root gives a slash chord (unless `ignoreBass`, for re-entrant tunings).
 */
export function nameChord(
  midis: readonly number[],
  { ignoreBass = false }: { ignoreBass?: boolean } = {},
): string[] {
  const pcs = [...new Set(midis.map(pitchClassOf))];
  if (pcs.length < 2) {
    return [];
  }
  const bass = pitchClassOf(Math.min(...midis));
  const found: { name: string; score: number }[] = [];
  for (const root of pcs) {
    const intervals = new Set(pcs.map((pc) => (pc - root + 12) % 12));
    QUALITIES.forEach((quality, rank) => {
      const exact = sameSet(intervals, quality.intervals);
      const noFifth =
        !exact &&
        quality.intervals.length >= 4 &&
        quality.intervals.includes(7) &&
        sameSet(
          intervals,
          quality.intervals.filter((interval) => interval !== 7),
        );
      if (!exact && !noFifth) {
        return;
      }
      const slash = !ignoreBass && bass !== root;
      found.push({
        name: `${NOTE_NAMES[root]}${quality.suffix}${slash ? `/${NOTE_NAMES[bass]}` : ''}`,
        score: (noFifth ? NO_FIFTH_PENALTY : 0) + (slash ? SLASH_PENALTY : 0) + rank,
      });
    });
  }
  return [...new Set(found.sort((a, b) => a.score - b.score).map((entry) => entry.name))];
}

/**
 * Whether the notes play `raw`: every note is a chord tone (or the slash bass), every tone is
 * there except an optional fifth in chords of four notes or more, and the lowest note is the
 * bass (or the root) unless `ignoreBass`.
 */
export function playsChord(
  midis: readonly number[],
  raw: string,
  { ignoreBass = false }: { ignoreBass?: boolean } = {},
): boolean {
  const chord = parseChord(raw);
  if (!chord || midis.length === 0) {
    return false;
  }
  const { root, bass, intervals } = chordTones(chord);
  const tones = intervals.map((interval) => (root + interval) % 12);
  const lowest = bass ?? root;
  const pcs = new Set(midis.map(pitchClassOf));
  if (![...pcs].every((pc) => tones.includes(pc) || pc === lowest)) {
    return false;
  }
  const fifth = (root + 7) % 12;
  const required = tones.length >= 4 ? tones.filter((tone) => tone !== fifth) : tones;
  if (!required.every((tone) => pcs.has(tone))) {
    return false;
  }
  return ignoreBass || pitchClassOf(Math.min(...midis)) === lowest;
}
