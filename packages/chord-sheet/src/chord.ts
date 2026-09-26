export type Chord = {
  raw: string;
  /** Note name as written, with the German `H` normalised to `B`: `C`, `F#`, `Bb`. */
  root: string;
  /** Everything between the root and the slash: `m7`, `sus4`, `maj7`. */
  suffix: string;
  bass: string | null;
};

export type ChordTones = {
  /** Pitch class 0–11, C = 0. */
  root: number;
  bass: number | null;
  /** Semitones above the root, 0–11, sorted. */
  intervals: number[];
};

const NATURALS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

const NOTE = '([A-H])([#b]?)';
const CHORD_RE = new RegExp(`^${NOTE}([^/\\s]*)(?:/${NOTE})?$`);

// Longest first, so `maj` wins over `m` and `sus4` over `sus`.
const SUFFIX_TOKENS = [
  'maj',
  'min',
  'dim',
  'aug',
  'sus2',
  'sus4',
  'sus',
  'add9',
  'add11',
  'add2',
  'add4',
  'b13',
  '#11',
  '13',
  '11',
  'b5',
  '#5',
  'b9',
  '#9',
  'm',
  'M',
  '-',
  '+',
  '°',
  'ø',
  'Δ',
  '5',
  '6',
  '7',
  '9',
  '(',
  ')',
] as const;

type SuffixToken = (typeof SUFFIX_TOKENS)[number];

function tokenizeSuffix(suffix: string): SuffixToken[] | null {
  const tokens: SuffixToken[] = [];
  let rest = suffix;
  while (rest.length > 0) {
    const token = SUFFIX_TOKENS.find((candidate) => rest.startsWith(candidate));
    if (!token) {
      return null;
    }
    tokens.push(token);
    rest = rest.slice(token.length);
  }
  return tokens;
}

function noteName(letter: string, accidental: string): string {
  return (letter === 'H' ? 'B' : letter) + accidental;
}

export function parseChord(raw: string): Chord | null {
  const match = CHORD_RE.exec(raw);
  if (!match) {
    return null;
  }
  const [, letter, accidental, suffix, bassLetter, bassAccidental] = match;
  if (!letter || suffix === undefined || tokenizeSuffix(suffix) === null) {
    return null;
  }
  return {
    raw,
    root: noteName(letter, accidental ?? ''),
    suffix,
    bass: bassLetter ? noteName(bassLetter, bassAccidental ?? '') : null,
  };
}

export function isChord(raw: string): boolean {
  return parseChord(raw) !== null;
}

export function pitchClass(note: string): number {
  const base = NATURALS[note[0] ?? ''] ?? 0;
  const shift = note[1] === '#' ? 1 : note[1] === 'b' ? -1 : 0;
  return (base + shift + 12) % 12;
}

export function chordTones(chord: Chord): ChordTones {
  const tokens = new Set(tokenizeSuffix(chord.suffix) ?? []);
  const has = (...names: SuffixToken[]) => names.some((name) => tokens.has(name));
  const root = pitchClass(chord.root);
  const bass = chord.bass ? pitchClass(chord.bass) : null;

  if (tokens.size === 1 && has('5')) {
    return { root, bass, intervals: [0, 7] };
  }

  const halfDiminished = has('ø');
  const diminished = has('dim', '°');
  const minor = has('m', 'min', '-') || diminished || halfDiminished;
  const major7 = has('maj', 'M', 'Δ');
  const hasSeventh = has('7', '9', '11', '13') || halfDiminished;

  const intervals = new Set<number>([0]);
  if (has('sus2')) {
    intervals.add(2);
  } else if (has('sus4', 'sus')) {
    intervals.add(5);
  } else {
    intervals.add(minor ? 3 : 4);
  }

  intervals.add(diminished || halfDiminished || has('b5') ? 6 : has('aug', '+', '#5') ? 8 : 7);

  if (has('6')) {
    intervals.add(9);
  }
  if (hasSeventh) {
    intervals.add(diminished && !halfDiminished ? 9 : major7 ? 11 : 10);
  }
  if (has('9', '11', '13', 'add9', 'add2')) {
    intervals.add(2);
  }
  if (has('11', 'add11', 'add4')) {
    intervals.add(5);
  }
  if (has('13')) {
    intervals.add(9);
  }
  if (has('b9')) {
    intervals.add(1);
  }
  if (has('#9')) {
    intervals.add(3);
  }
  if (has('#11')) {
    intervals.add(6);
  }
  if (has('b13')) {
    intervals.add(8);
  }

  return { root, bass, intervals: [...intervals].sort((a, b) => a - b) };
}
