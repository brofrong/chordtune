import {
  type ChordTones,
  chordTones,
  isReentrant,
  parseChord,
  pitchClass,
} from '@chordtune/chord-sheet';

import { CHORD_CATALOG, type GuitarFrets, OPEN_STRING_MIDI } from './guitar-synth';

const MAX_WINDOW_FRET = 12;
const HAND_SPAN = 3;
const MAX_FINGERS = 4;
const DEFAULT_LIMIT = 8;

export type Voicing = {
  /** Thickest string first; `null` does not sound. */
  frets: GuitarFrets;
  /** Lower is easier: stretch, position up the neck, muted and open strings. */
  cost: number;
  barre: boolean;
};

/** The index finger across strings `from`…`to` (thickest = 0) at `fret`. */
export type Barre = { fret: number; from: number; to: number };

const cache = new Map<string, Voicing[]>();

/**
 * Shapes for a chord as written (`F#m7`, `D/F#`, `Hm`) on `strings` (open strings as MIDI notes,
 * thickest first), easiest first. In standard tuning the catalog shape leads; the rest come
 * from a search over the neck: the easiest shape of each position, then the others.
 */
export function voicingsFor(
  raw: string,
  strings: readonly number[] = OPEN_STRING_MIDI,
  { limit = DEFAULT_LIMIT }: { limit?: number } = {},
): Voicing[] {
  const key = `${raw}|${strings.join()}|${limit}`;
  let found = cache.get(key);
  if (!found) {
    found = findVoicings(raw, strings, limit);
    cache.set(key, found);
  }
  return found;
}

/** The easiest shape, or null if it is not a chord or nothing fits. */
export function voicingFor(
  raw: string,
  strings: readonly number[] = OPEN_STRING_MIDI,
): GuitarFrets | null {
  return voicingsFor(raw, strings)[0]?.frets ?? null;
}

function isStandard(strings: readonly number[]): boolean {
  return (
    strings.length === OPEN_STRING_MIDI.length &&
    strings.every((midi, i) => midi === OPEN_STRING_MIDI[i])
  );
}

function findVoicings(raw: string, strings: readonly number[], limit: number): Voicing[] {
  const chord = parseChord(raw);
  if (!chord) {
    return [];
  }
  const searched = searchVoicings(chordTones(chord), strings);
  if (!chord.bass && isStandard(strings)) {
    const root = pitchClass(chord.root);
    const known = CHORD_CATALOG.find((spec) => {
      const candidate = parseChord(spec.label);
      return candidate?.suffix === chord.suffix && pitchClass(candidate.root) === root;
    });
    if (known) {
      const id = known.frets.join();
      const rest = searched.filter((voicing) => voicing.frets.join() !== id);
      return pickVaried([describe(known.frets), ...rest], limit);
    }
  }
  return pickVaried(searched, limit);
}

function describe(frets: GuitarFrets): Voicing {
  return { frets, cost: difficulty(frets), barre: barreOf(frets) !== null };
}

/** Where the hand sits: 0 for shapes with open strings, else the lowest fretted fret. */
function position(frets: GuitarFrets): number {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  return frets.includes(0) || fretted.length === 0 ? 0 : Math.min(...fretted);
}

/** The first shape of each position (in the given order), then the rest, up to `limit`. */
function pickVaried(voicings: Voicing[], limit: number): Voicing[] {
  const seen = new Set<number>();
  const firsts: Voicing[] = [];
  const rest: Voicing[] = [];
  for (const voicing of voicings) {
    const at = position(voicing.frets);
    (seen.has(at) ? rest : firsts).push(voicing);
    seen.add(at);
  }
  return [...firsts, ...rest].slice(0, limit);
}

const sounding = (frets: GuitarFrets) => frets.filter((fret) => fret !== null).length;

/**
 * Every four-fret window up to the 12th fret: strings sound in one contiguous run (muted
 * strings only at the edges), all chord tones are present (the fifth may be dropped from
 * four-note chords), the lowest note is the bass unless the tuning is re-entrant, and the
 * shape needs at most four fingers with a barre. Easiest first; on a tie, fuller shapes first.
 */
function searchVoicings(
  { root, bass, intervals }: ChordTones,
  strings: readonly number[],
): Voicing[] {
  const tones = intervals.map((interval) => (root + interval) % 12);
  const lowest = isReentrant(strings) ? null : (bass ?? root);
  const allowed = new Set([...tones, bass ?? root]);
  const fifth = (root + 7) % 12;
  const required = tones.length >= 4 ? tones.filter((tone) => tone !== fifth) : tones;
  const minSounding = Math.min(4, strings.length - 1);
  const found = new Map<string, Voicing>();

  for (let window = 0; window <= MAX_WINDOW_FRET; window++) {
    const options = strings.map((open) => {
      const frets: number[] = [];
      if (allowed.has(open % 12)) {
        frets.push(0);
      }
      for (let fret = Math.max(1, window); fret <= window + HAND_SPAN; fret++) {
        if (allowed.has((open + fret) % 12)) {
          frets.push(fret);
        }
      }
      return frets;
    });

    const walk = (string: number, chosen: (number | null)[]) => {
      if (chosen.filter((fret) => fret !== null).length >= minSounding) {
        const frets = [...chosen, ...Array<null>(strings.length - string).fill(null)];
        const id = frets.join();
        if (!found.has(id) && fits(frets, strings, required, lowest)) {
          found.set(id, describe(frets));
        }
      }
      if (string === strings.length) {
        return;
      }
      for (const fret of options[string]) {
        walk(string + 1, [...chosen, fret]);
      }
    };

    for (let first = 0; first <= strings.length - minSounding; first++) {
      walk(first, Array<null>(first).fill(null));
    }
  }

  return [...found.values()].sort(
    (a, b) => a.cost - b.cost || sounding(b.frets) - sounding(a.frets),
  );
}

function fits(
  frets: GuitarFrets,
  strings: readonly number[],
  required: number[],
  lowest: number | null,
): boolean {
  const midis = frets.flatMap((fret, i) => (fret === null ? [] : [strings[i] + fret]));
  if (lowest !== null && Math.min(...midis) % 12 !== lowest) {
    return false;
  }
  const pcs = new Set(midis.map((midi) => midi % 12));
  return required.every((tone) => pcs.has(tone)) && fingersNeeded(frets) <= MAX_FINGERS;
}

function difficulty(frets: GuitarFrets): number {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  const minFret = fretted.length > 0 ? Math.min(...fretted) : 0;
  const maxFret = fretted.length > 0 ? Math.max(...fretted) : 0;
  const muted = frets.filter((fret) => fret === null).length;
  const open = frets.filter((fret) => fret === 0).length;
  const cost = maxFret - minFret + minFret * 0.4 + muted * 1.2 - open * 0.3;
  // Round away float noise (e.g. 1.2 - 3 * 0.3 vs 3 * 0.4 - 3 * 0.3 differ by ~2e-16) so shapes
  // that are meant to tie actually do, and the sounding() tiebreak in searchVoicings can apply.
  return Math.round(cost * 1e6) / 1e6;
}

/** A barre covers every string at the lowest fret unless an open string sits under it. */
function fingersNeeded(frets: GuitarFrets): number {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  if (fretted.length === 0) {
    return 0;
  }
  const minFret = Math.min(...fretted);
  const atMin = frets.flatMap((fret, i) => (fret === minFret ? [i] : []));
  if (atMin.length < 2) {
    return fretted.length;
  }
  const from = atMin[0];
  const to = atMin[atMin.length - 1];
  const openUnderBarre = frets.slice(from, to + 1).some((fret) => fret === 0);
  return openUnderBarre ? fretted.length : fretted.length - atMin.length + 1;
}

/** The barre a shape is played with: only when it needs more than four fingers otherwise. */
export function barreOf(frets: GuitarFrets): Barre | null {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  if (fretted.length <= MAX_FINGERS) {
    return null;
  }
  const fret = Math.min(...fretted);
  const atMin = frets.flatMap((value, i) => (value === fret ? [i] : []));
  const from = atMin[0];
  const to = atMin[atMin.length - 1];
  if (atMin.length < 2 || frets.slice(from, to + 1).some((value) => value === 0)) {
    return null;
  }
  return { fret, from, to };
}
