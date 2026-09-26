import { RHYTHM_PRESETS, type RhythmPreset } from './rhythm-presets';

/** ↓ ↑ ⇣ (muted down) ⇡ (muted up) x (muted hit). */
export type Stroke = 'D' | 'U' | 'd' | 'u' | 'x';
/** `B` is the chord's bass string, `B'` the alternating bass. */
export type StringRef = 'B' | "B'" | 1 | 2 | 3 | 4 | 5 | 6;
/** `null` is a rest. */
export type Step = { stroke?: Stroke; strings?: StringRef[]; accent?: boolean } | null;
export type RhythmKind = 'strum' | 'pick';
export type TimeSignature = '4/4' | '3/4' | '6/8';

export type Rhythm = {
  /** `A`, `B`, … — referenced from the song as `@A`. */
  key: string;
  name: string;
  kind: RhythmKind;
  time: TimeSignature;
  /** Evenly spread over one bar. */
  steps: Step[];
};

export type RhythmDraft = Omit<Rhythm, 'key'>;

export const MAX_STEPS = 32;
const STROKES: readonly Stroke[] = ['D', 'U', 'd', 'u', 'x'];
const STRING_REFS: readonly StringRef[] = ['B', "B'", 1, 2, 3, 4, 5, 6];
const KINDS: readonly RhythmKind[] = ['strum', 'pick'];
const TIMES: readonly TimeSignature[] = ['4/4', '3/4', '6/8'];

/** Quarter notes per bar. */
export function barBeats(time: TimeSignature): number {
  return time === '4/4' ? 4 : 3;
}

export function rhythmFromPreset(preset: RhythmPreset, key: string): Rhythm {
  const { id: _id, ...draft } = preset;
  return { ...structuredClone(draft), key };
}

const STROKE_SYMBOLS: Record<Stroke, string> = { D: '↓', U: '↑', d: '⇣', u: '⇡', x: 'x' };
const SYMBOL_STROKES: Record<string, Stroke> = {
  '↓': 'D',
  '↑': 'U',
  '⇣': 'd',
  '⇡': 'u',
  x: 'x',
  '×': 'x',
  х: 'x',
};

function stringSymbol(ref: StringRef): string {
  return ref === 'B' ? 'Б' : ref === "B'" ? "Б'" : String(ref);
}

/** One symbol per step for compact display: `↓ · ↓ ↑` or `Б 3 2 3`. */
export function strumSymbols(rhythm: Pick<Rhythm, 'kind' | 'steps'>): string[] {
  return rhythm.steps.map((step) => {
    if (!step) {
      return '·';
    }
    if (rhythm.kind === 'pick') {
      return step.strings?.length ? step.strings.map(stringSymbol).join('') : '·';
    }
    return step.stroke ? STROKE_SYMBOLS[step.stroke] : '·';
  });
}

function withoutRests(steps: Step[]): string {
  return steps
    .filter((step) => step !== null)
    .map((step) => step.stroke ?? '')
    .join('');
}

function presetFor(id: string): RhythmDraft | null {
  const preset = RHYTHM_PRESETS.find((candidate) => candidate.id === id);
  if (!preset) {
    return null;
  }
  const { id: _id, ...draft } = preset;
  return structuredClone(draft);
}

const STRUM_RUN_RE = /[↓↑⇣⇡x×х·\-\\/\s]*[↓↑⇣⇡][↓↑⇣⇡x×х·\-\\/\s]*/;
const STRUM_WORDS: [RegExp, string][] = [
  [/шест[её]рк/i, 'six'],
  [/восьм[её]рк/i, 'eight'],
  [/четв[её]рк/i, 'four'],
];

/**
 * Reads strum notation from notes: `↓↓↑↑↓↑`, `↓ ↓ ⇣⇡↓↑`, `\↓/` for an accent, or the words
 * «шестёрка», «восьмёрка», «четвёрка». Arrows that match a preset give that preset.
 */
export function parseStrumNotation(text: string): RhythmDraft | null {
  const run = STRUM_RUN_RE.exec(text)?.[0] ?? '';
  const steps: Step[] = [];
  for (let i = 0; i < run.length; i++) {
    const char = run[i] ?? '';
    if (char === '·' || char === '-') {
      steps.push(null);
      continue;
    }
    if (char === '\\' && SYMBOL_STROKES[run[i + 1] ?? ''] && run[i + 2] === '/') {
      steps.push({ stroke: SYMBOL_STROKES[run[i + 1] ?? ''], accent: true });
      i += 2;
      continue;
    }
    const stroke = SYMBOL_STROKES[char];
    if (stroke) {
      steps.push({ stroke });
    }
  }

  const strokes = withoutRests(steps);
  const matching = RHYTHM_PRESETS.find(
    (preset) => preset.kind === 'strum' && withoutRests(preset.steps) === strokes,
  );
  if (strokes && matching) {
    return presetFor(matching.id);
  }
  const word = STRUM_WORDS.find(([re]) => re.test(text));
  if (word) {
    return presetFor(word[1]);
  }
  if (!strokes || steps.length > MAX_STEPS) {
    return null;
  }
  return { name: 'Бой', kind: 'strum', time: '4/4', steps };
}

const PICK_RUN_RE = /[бБB]'?(?:\s*[-—–|\s]\s*(?:[бБB]'?|[1-6]+))+/;

function pickKey(steps: Step[]): string {
  return JSON.stringify(steps);
}

/** Reads fingerpicking notation: `Б-3-2-3`, `б—3—2|1—3`, `б-3-12-3` (`12` = strings 1 and 2 together). */
export function parsePickNotation(text: string): RhythmDraft | null {
  const run = PICK_RUN_RE.exec(text)?.[0];
  if (!run) {
    return null;
  }
  const steps: Step[] = run
    .split(/[-—–|\s]+/)
    .filter(Boolean)
    .map((token) => {
      if (/^[бБB]'$/.test(token)) {
        return { strings: ["B'"] };
      }
      if (/^[бБB]$/.test(token)) {
        return { strings: ['B'] };
      }
      return { strings: [...token].map(Number) as StringRef[] };
    });
  if (steps.length > MAX_STEPS) {
    return null;
  }

  const matching = RHYTHM_PRESETS.find((preset) => {
    if (preset.kind !== 'pick' || preset.steps.length % steps.length !== 0) {
      return false;
    }
    const times = preset.steps.length / steps.length;
    return pickKey(preset.steps) === pickKey(Array.from({ length: times }, () => steps).flat());
  });
  if (matching) {
    return presetFor(matching.id);
  }
  return { name: 'Перебор', kind: 'pick', time: '4/4', steps };
}

function isStep(value: unknown): value is Step {
  if (value === null) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  const { stroke, strings, accent } = value as Record<string, unknown>;
  return (
    (stroke === undefined || STROKES.includes(stroke as Stroke)) &&
    (strings === undefined ||
      (Array.isArray(strings) && strings.every((s) => STRING_REFS.includes(s as StringRef)))) &&
    (accent === undefined || typeof accent === 'boolean')
  );
}

/** Runtime check for rhythms coming from the client or the database. */
export function isRhythm(value: unknown): value is Rhythm {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const { key, name, kind, time, steps } = value as Record<string, unknown>;
  return (
    typeof key === 'string' &&
    /^[A-Z]$/.test(key) &&
    typeof name === 'string' &&
    name.length <= 60 &&
    KINDS.includes(kind as RhythmKind) &&
    TIMES.includes(time as TimeSignature) &&
    Array.isArray(steps) &&
    steps.length >= 1 &&
    steps.length <= MAX_STEPS &&
    steps.every(isStep)
  );
}
