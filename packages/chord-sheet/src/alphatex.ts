import {
  barQuarters,
  type NoteEffects,
  type TabBar,
  type TabBeat,
  type TabBlock,
  type TabDuration,
  type TabNote,
} from './tab';
import { isTempo, MAX_TEMPO, MIN_TEMPO } from './tempo';
import type { Diagnostic } from './types';

type Pos = { line: number; col: number };
type Token = Pos & { kind: 'cmd' | 'word' | 'str' | 'dur' | 'punct'; value: string };

type Effects = {
  note: NoteEffects;
  dotted: boolean;
  tuplet: number | null;
  text: string | null;
  palmMute: boolean;
  letRing: boolean;
};

const DURATIONS: readonly TabDuration[] = [1, 2, 4, 8, 16, 32];
/** Length of one note of an n-tuplet relative to a plain one. */
const TUPLETS: Record<number, number> = { 3: 2 / 3, 5: 4 / 5, 6: 4 / 6 };
const NOTE_RE = /^(\d+|x|-)\.(\d+)(?:\.(\d+))?$/;
const REST_RE = /^r(?:\.(\d+))?$/;
const BEAT_DURATION_RE = /^\.(\d+)$/;
const NUMBER_RE = /^\d+$/;
const WORD_END_RE = /[\s{}()|"\\:]/;
const PUNCT = '{}()|';
const META = new Set(['tempo', 'ts', 'lyrics']);
const MAX_FRET = 24;
const MAX_NUMERATOR = 16;
const EPSILON = 1e-6;

function toDuration(text: string): TabDuration | null {
  const value = Number(text);
  return DURATIONS.find((duration) => duration === value) ?? null;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

function tokenize(lines: readonly string[], firstLineNo: number, diagnostics: Diagnostic[]) {
  const tokens: Token[] = [];
  lines.forEach((text, index) => {
    const line = firstLineNo + index;
    let i = 0;
    while (i < text.length) {
      const char = text[i] ?? '';
      const col = i + 1;
      if (/\s/.test(char)) {
        i++;
      } else if (PUNCT.includes(char)) {
        tokens.push({ kind: 'punct', value: char, line, col });
        i++;
      } else if (char === '"') {
        const end = text.indexOf('"', i + 1);
        if (end === -1) {
          diagnostics.push({ line, col, severity: 'error', message: 'Unclosed "' });
          tokens.push({ kind: 'str', value: text.slice(i + 1), line, col });
          break;
        }
        tokens.push({ kind: 'str', value: text.slice(i + 1, end), line, col });
        i = end + 1;
      } else {
        let end = i + 1;
        while (end < text.length && !WORD_END_RE.test(text[end] ?? '')) {
          end++;
        }
        if (char === '\\') {
          tokens.push({ kind: 'cmd', value: text.slice(i + 1, end), line, col });
        } else if (char === ':') {
          tokens.push({ kind: 'dur', value: text.slice(i + 1, end), line, col });
        } else {
          tokens.push({ kind: 'word', value: text.slice(i, end), line, col });
        }
        i = end;
      }
    }
  });
  return tokens;
}

function splitSyllables(text: string): string[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      const parts = word.split('-');
      return parts
        .map((part, index) => (index < parts.length - 1 ? `${part}-` : part))
        .filter((part) => part !== '' && part !== '-');
    });
}

function playOrder(bars: readonly TabBar[]): number[] {
  const order: number[] = [];
  let from = 0;
  bars.forEach((bar, index) => {
    if (bar.repeatOpen) {
      from = index;
    }
    order.push(index);
    if (bar.repeatClose !== null) {
      for (let time = 1; time < bar.repeatClose; time++) {
        for (let i = from; i <= index; i++) {
          order.push(i);
        }
      }
      from = index + 1;
    }
  });
  return order;
}

/**
 * Parses the subset of alphaTex described in the spec: `\tempo`, `\ts`, `\lyrics`, notes
 * `fret.string[.duration]`, rests, `(…)` chords, `x` and `-` notes, `:N`, `{…}` effects, `|`,
 * `\ro`/`\rc N`. `firstLineNo` is the song line of `lines[0]`. Never throws.
 */
export function parseAlphaTex(
  lines: readonly string[],
  firstLineNo = 1,
): { block: TabBlock; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const tokens = tokenize(lines, firstLineNo, diagnostics);
  const block: TabBlock = { tempo: null, time: [4, 4], bars: [], playOrder: [] };
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const isPunct = (token: Token | undefined, value: string) =>
    token?.kind === 'punct' && token.value === value;
  const report = (at: Pos, severity: Diagnostic['severity'], message: string) =>
    diagnostics.push({ line: at.line, col: at.col, severity, message });
  const number = (): number | null => {
    const token = peek();
    if (token?.kind === 'word' && NUMBER_RE.test(token.value)) {
      pos++;
      return Number(token.value);
    }
    return null;
  };

  // Metadata comes first.
  let lyrics: Token | null = null;
  for (let token = peek(); token?.kind === 'cmd' && META.has(token.value); token = peek()) {
    pos++;
    if (token.value === 'tempo') {
      const tempo = number();
      if (tempo !== null && isTempo(tempo)) {
        block.tempo = tempo;
      } else {
        report(token, 'warning', `Tempo must be ${MIN_TEMPO}–${MAX_TEMPO}: ${tempo ?? ''}`.trim());
      }
    } else if (token.value === 'ts') {
      const n = number();
      const m = number();
      if (n && m && n <= MAX_NUMERATOR && toDuration(String(m))) {
        block.time = [n, m];
      } else {
        report(token, 'warning', 'Time signature must look like \\ts 3 4');
      }
    } else {
      const text = peek();
      if (text?.kind === 'str') {
        pos++;
        lyrics = text;
      } else {
        report(token, 'error', 'Expected "…" after \\lyrics');
      }
    }
  }

  const emptyEffects = (): Effects => ({
    note: {},
    dotted: false,
    tuplet: null,
    text: null,
    palmMute: false,
    letRing: false,
  });

  const bendPoints = (): number[] | null => {
    if (!isPunct(peek(), '(')) {
      return null;
    }
    pos++;
    const points: number[] = [];
    for (let value = number(); value !== null; value = number()) {
      points.push(value);
    }
    if (!isPunct(peek(), ')')) {
      return null;
    }
    pos++;
    return points.length > 0 ? points : null;
  };

  /** A `{…}` group right after a note, `)` or duration; empty when there is none. */
  const effects = (): Effects => {
    const result = emptyEffects();
    const open = peek();
    if (!open || !isPunct(open, '{')) {
      return result;
    }
    pos++;
    for (;;) {
      const token = next();
      if (!token) {
        report(open, 'error', 'Unclosed {');
        return result;
      }
      if (isPunct(token, '}')) {
        return result;
      }
      if (token.kind !== 'word') {
        report(token, 'error', `Unexpected ${token.value} in {…}`);
        continue;
      }
      switch (token.value) {
        case 'd':
          result.dotted = true;
          break;
        case 'tu': {
          const n = number();
          if (n !== null && TUPLETS[n]) {
            result.tuplet = n;
          } else {
            report(token, 'error', 'Tuplet must be tu 3, tu 5 or tu 6');
          }
          break;
        }
        case 'h':
          result.note.hammer = true;
          break;
        case 'sl':
          result.note.slide = true;
          break;
        case 'v':
          result.note.vibrato = true;
          break;
        case 'pm':
          result.palmMute = true;
          break;
        case 'lr':
          result.letRing = true;
          break;
        case 'txt': {
          const text = peek();
          if (text?.kind === 'str') {
            pos++;
            result.text = text.value;
          } else {
            report(token, 'error', 'Expected "…" after txt');
          }
          break;
        }
        case 'b': {
          const bend = bendPoints();
          if (bend) {
            result.note.bend = bend;
          } else {
            report(token, 'error', 'Bend must look like b (0 4)');
          }
          break;
        }
        default:
          report(token, 'warning', `Unknown effect: ${token.value}`);
      }
    }
  };

  let duration: TabDuration = 4;
  const lastFret = new Map<number, number | 'x'>();

  const readNote = (token: Token): { note: TabNote; duration: string | undefined } | null => {
    const match = NOTE_RE.exec(token.value);
    if (!match) {
      report(token, 'error', `Not a note: ${token.value}`);
      return null;
    }
    const [, fretText = '', stringText = '', durationText] = match;
    const string = Number(stringText);
    if (string < 1 || string > 6) {
      report(token, 'error', `String must be 1–6: ${token.value}`);
      return null;
    }
    let fret: number | 'x';
    let tie = false;
    if (fretText === '-') {
      const previous = lastFret.get(string);
      if (previous === undefined) {
        report(token, 'error', `Nothing to tie on string ${string}`);
        return null;
      }
      fret = previous;
      tie = true;
    } else if (fretText === 'x') {
      fret = 'x';
    } else {
      fret = Number(fretText);
      if (fret > MAX_FRET) {
        report(token, 'error', `Fret must be 0–${MAX_FRET}: ${token.value}`);
        return null;
      }
    }
    lastFret.set(string, fret);
    return { note: { string, fret, tie, effects: {} }, duration: durationText };
  };

  const makeBeat = (
    at: Token,
    notes: TabNote[],
    durationText: string | undefined,
    fx: Effects,
  ): TabBeat | null => {
    let beatDuration = duration;
    if (durationText !== undefined) {
      const parsed = toDuration(durationText);
      if (!parsed) {
        report(at, 'error', `Unknown duration: .${durationText}`);
        return null;
      }
      beatDuration = parsed;
    }
    const tuplet = fx.tuplet ? (TUPLETS[fx.tuplet] ?? 1) : 1;
    return {
      quarters: (4 / beatDuration) * (fx.dotted ? 1.5 : 1) * tuplet,
      duration: beatDuration,
      dotted: fx.dotted,
      tuplet: fx.tuplet,
      notes,
      text: fx.text,
      syllable: null,
      palmMute: fx.palmMute,
      letRing: fx.letRing,
    };
  };

  const singleBeat = (token: Token): TabBeat | null => {
    const rest = REST_RE.exec(token.value);
    if (rest) {
      return makeBeat(token, [], rest[1], effects());
    }
    const read = readNote(token);
    const fx = effects();
    if (!read) {
      return null;
    }
    read.note.effects = fx.note;
    return makeBeat(token, [read.note], read.duration, fx);
  };

  const chordBeat = (open: Token): TabBeat | null => {
    const notes: TabNote[] = [];
    for (;;) {
      const token = next();
      if (!token) {
        report(open, 'error', 'Unclosed (');
        return null;
      }
      if (isPunct(token, ')')) {
        break;
      }
      if (token.kind !== 'word') {
        report(token, 'error', `Unexpected ${token.value} in (…)`);
        continue;
      }
      const read = readNote(token);
      const fx = effects();
      if (!read) {
        continue;
      }
      if (read.duration !== undefined) {
        report(token, 'error', 'Put the duration after the closing )');
      }
      read.note.effects = fx.note;
      notes.push(read.note);
    }
    let durationText: string | undefined;
    const after = peek();
    const match = after?.kind === 'word' ? BEAT_DURATION_RE.exec(after.value) : null;
    if (match) {
      pos++;
      durationText = match[1];
    }
    const fx = effects();
    if (notes.length === 0) {
      report(open, 'error', 'Empty chord ()');
      return null;
    }
    for (const note of notes) {
      note.effects = { ...fx.note, ...note.effects };
    }
    return makeBeat(open, notes, durationText, fx);
  };

  const newBar = (): TabBar => ({ beats: [], repeatOpen: false, repeatClose: null });
  let bar = newBar();
  const bars: TabBar[] = [bar];
  const barAt: Pos[] = [peek() ?? { line: firstLineNo, col: 1 }];
  let repeatOpen = false;

  while (pos < tokens.length) {
    const token = next() as Token;
    if (isPunct(token, '|')) {
      bar = newBar();
      bars.push(bar);
      barAt.push(token);
      continue;
    }
    if (token.kind === 'cmd') {
      if (token.value === 'ro') {
        if (repeatOpen) {
          report(token, 'error', 'Nested repeats are not supported');
        }
        repeatOpen = true;
        bar.repeatOpen = true;
      } else if (token.value === 'rc') {
        const times = number();
        if (times !== null && times >= 2) {
          bar.repeatClose = times;
        } else {
          report(token, 'error', 'Expected \\rc N with N ≥ 2');
        }
        repeatOpen = false;
      } else {
        report(token, 'warning', `Unknown command: \\${token.value}`);
      }
      continue;
    }
    if (token.kind === 'dur') {
      const parsed = toDuration(token.value);
      if (parsed) {
        duration = parsed;
      } else {
        report(token, 'error', `Unknown duration: :${token.value}`);
      }
      continue;
    }
    let beat: TabBeat | null = null;
    if (isPunct(token, '(')) {
      beat = chordBeat(token);
    } else if (token.kind === 'word') {
      beat = singleBeat(token);
    } else {
      report(
        token,
        'error',
        `Unexpected ${token.kind === 'str' ? `"${token.value}"` : token.value}`,
      );
      continue;
    }
    if (beat) {
      if (bar.beats.length === 0) {
        barAt[bars.length - 1] = token;
      }
      bar.beats.push(beat);
    }
  }

  // A trailing `|` (or an empty block) leaves empty bars at the end.
  for (let last = bars.at(-1); last; last = bars.at(-1)) {
    if (last.beats.length > 0 || last.repeatOpen || last.repeatClose !== null) {
      break;
    }
    bars.pop();
  }

  const expected = barQuarters(block.time);
  bars.forEach((current, index) => {
    const total = current.beats.reduce((sum, beat) => sum + beat.quarters, 0);
    if (Math.abs(total - expected) > EPSILON) {
      report(
        barAt[index] ?? { line: firstLineNo, col: 1 },
        'warning',
        `Bar ${index + 1}: ${round(total)} of ${round(expected)} quarter notes`,
      );
    }
  });

  if (lyrics) {
    const syllables = splitSyllables(lyrics.value);
    let used = 0;
    for (const beat of bars.flatMap((current) => current.beats)) {
      if (used >= syllables.length) {
        break;
      }
      if (beat.notes.length === 0 || beat.notes.every((note) => note.tie)) {
        continue;
      }
      const syllable = syllables[used++] ?? null;
      beat.syllable = syllable === '_' ? null : syllable;
    }
    if (used < syllables.length) {
      report(lyrics, 'warning', `Syllables without notes: ${syllables.length - used}`);
    }
  }

  block.bars = bars;
  block.playOrder = playOrder(bars);
  return { block, diagnostics };
}

/** A song line for an alphaTex block, e.g. after editing its source. */
export function alphatexLine(source: string[]) {
  return { type: 'alphatex' as const, source, block: parseAlphaTex(source).block };
}
