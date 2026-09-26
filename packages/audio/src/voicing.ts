import { type ChordTones, chordTones, parseChord, pitchClass } from '@chordtune/chord-sheet';

import { CHORD_CATALOG, type GuitarFrets, OPEN_STRING_MIDI } from './guitar-synth';

const MAX_WINDOW_FRET = 9;
const HAND_SPAN = 3;
const MIN_SOUNDING = 4;
const MAX_FINGERS = 4;

const cache = new Map<string, GuitarFrets | null>();

/** A guitar shape for a chord as written (`F#m7`, `D/F#`, `Hm`), or null if it is not a chord. */
export function voicingFor(raw: string): GuitarFrets | null {
  let frets = cache.get(raw);
  if (frets === undefined) {
    frets = findVoicing(raw);
    cache.set(raw, frets);
  }
  return frets;
}

function findVoicing(raw: string): GuitarFrets | null {
  const chord = parseChord(raw);
  if (!chord) {
    return null;
  }
  if (!chord.bass) {
    const root = pitchClass(chord.root);
    const known = CHORD_CATALOG.find((spec) => {
      const candidate = parseChord(spec.label);
      return candidate?.suffix === chord.suffix && pitchClass(candidate.root) === root;
    });
    if (known) {
      return known.frets;
    }
  }
  return searchVoicing(chordTones(chord));
}

/**
 * Tries every four-fret window: strings sound in one contiguous run (muted strings only at the
 * edges), the lowest note is the bass, all chord tones are present (the fifth may be dropped
 * from four-note chords), and the shape needs at most four fingers with a barre.
 */
function searchVoicing({ root, bass, intervals }: ChordTones): GuitarFrets | null {
  const tones = intervals.map((interval) => (root + interval) % 12);
  const lowest = bass ?? root;
  const allowed = new Set([...tones, lowest]);
  const fifth = (root + 7) % 12;
  const required = tones.length >= 4 ? tones.filter((tone) => tone !== fifth) : tones;

  const best: { frets: (number | null)[] | null; cost: number } = { frets: null, cost: Infinity };

  const consider = (frets: (number | null)[]) => {
    const cost = shapeCost(frets, required, lowest);
    if (cost !== null && cost < best.cost) {
      best.frets = frets;
      best.cost = cost;
    }
  };

  for (let window = 0; window <= MAX_WINDOW_FRET; window++) {
    const options = OPEN_STRING_MIDI.map((open) => {
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
      if (chosen.filter((fret) => fret !== null).length >= MIN_SOUNDING) {
        consider([...chosen, ...Array<null>(6 - string).fill(null)]);
      }
      if (string === 6) {
        return;
      }
      for (const fret of options[string]) {
        walk(string + 1, [...chosen, fret]);
      }
    };

    for (let first = 0; first <= 6 - MIN_SOUNDING; first++) {
      walk(first, Array<null>(first).fill(null));
    }
  }

  return best.frets;
}

function shapeCost(frets: (number | null)[], required: number[], lowest: number): number | null {
  const midis = frets.flatMap((fret, i) => (fret === null ? [] : [OPEN_STRING_MIDI[i] + fret]));
  if (Math.min(...midis) % 12 !== lowest) {
    return null;
  }
  const pcs = new Set(midis.map((midi) => midi % 12));
  if (!required.every((tone) => pcs.has(tone))) {
    return null;
  }

  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  const minFret = fretted.length > 0 ? Math.min(...fretted) : 0;
  const maxFret = fretted.length > 0 ? Math.max(...fretted) : 0;
  if (fingersNeeded(frets, minFret) > MAX_FINGERS) {
    return null;
  }

  const muted = frets.filter((fret) => fret === null).length;
  const open = frets.filter((fret) => fret === 0).length;
  return maxFret - minFret + minFret * 0.4 + muted * 1.2 - open * 0.3;
}

/** A barre covers every string at the lowest fret unless an open string sits under it. */
function fingersNeeded(frets: (number | null)[], minFret: number): number {
  const fretted = frets.filter((fret) => fret !== null && fret > 0).length;
  const atMin = frets.flatMap((fret, i) => (fret === minFret && minFret > 0 ? [i] : []));
  if (atMin.length < 2) {
    return fretted;
  }
  const from = atMin[0];
  const to = atMin[atMin.length - 1];
  const openUnderBarre = frets.slice(from, to + 1).some((fret) => fret === 0);
  return openUnderBarre ? fretted : fretted - atMin.length + 1;
}
