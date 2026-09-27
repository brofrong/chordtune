# alphaTex Tabs, Section Tempo and Playback Speed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Songs can contain alphaTex tab blocks (durations, effects, text and lyrics) that render as tablature, play through the guitar synth, scroll in zen mode, and sit in the song's timeline; sections and blocks can override the tempo; listeners pick a playback speed (0.5×–1.5×).

**Architecture:** `packages/chord-sheet` gets a tab model (`tab.ts`), an alphaTex subset parser (`alphatex.ts`), a new `alphatex` line type, a section tempo in headers, and tab events in `timeline()`. `packages/audio` turns tab blocks into `ScheduledNote`s (`tab-schedule.ts`) and uses per-event tempo in `eventSeconds`/`scheduleNotes`. The web app adds a pure layout (`tab-layout.ts`) and an SVG `TabStaff`, a speed multiplier applied on top of finished schedules, and editor UI (section tempo, tab block, tab editor sheet). Obsidian `jtab` blocks convert to alphaTex on import.

**Tech Stack:** TypeScript 6, Bun test, React 19 / Next 16, Tailwind, next-intl, base-ui (`@/components/ui/*`), Biome.

**Spec:** `docs/superpowers/specs/2026-09-27-alphatex-tabs-design.md`

## Global Constraints

- Tempo range everywhere: 30–300 BPM (`MIN_TEMPO = 30`, `MAX_TEMPO = 300`).
- Section tempo syntax: `[Label] @X 140bpm` / `[Label] 140bpm`; applies to that section only.
- alphaTex block fences: `{start_of_alphatex}` / `{end_of_alphatex}`. `{start_of_tab}` (ASCII) stays as is: displayed, takes no time.
- Block tempo precedence: `\tempo` of the block → section tempo → song tempo.
- Durations: `1 2 4 8 16 32`; `.N` after a note/rest/`)` applies to that beat only; `:N` sets the default for following beats; default `:4`.
- Speed steps: `0.5, 0.75, 1, 1.25, 1.5`; in memory only, the song opens at 1×; speed never changes tempo or the timeline — it divides finished times.
- Standard tuning; capo from song meta shifts every scheduled note (chords and tabs alike).
- Diagnostics: `{ line, col, severity, message }`, 1-based, positions in the song source; parsers never throw.
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- UI copy in `apps/web/messages/ru.json` and `en.json`; UI is verified by the user by hand (no screenshots).
- Commands: package tests `cd packages/<pkg> && bun test <file>`; web tests `cd apps/web && bun test <file>`; types `bunx turbo run check-types`; lint `bun run lint` from the repo root.

## Review Focus

1. The user's riff pasted verbatim — blank line between rows, trailing `|` — parses to 8 full bars with no diagnostics (Task 1 test `the riff`).
2. Old songs with ASCII `{start_of_tab}` still display and take no time (Task 3 keeps `tabs are skipped`; Task 2 round-trip test).
3. A song with only a tab and no chords can be listened to and played along (Task 5 test `tab-only song`; Task 7 `canPlay`).
4. Typing a tempo in the tab sheet one digit at a time (`1` → `14` → `140`) keeps what was typed (Task 9 test `readBlockMeta returns the raw value`).
5. A freshly added empty alphaTex block takes no time and renders/plays without crashing (Task 3 test `empty blocks take no time`, Task 6 test `empty block has no rows`).

---

### Task 1: Tab model and alphaTex parser

**Files:**
- Create: `packages/chord-sheet/src/tempo.ts`
- Create: `packages/chord-sheet/src/tab.ts`
- Create: `packages/chord-sheet/src/alphatex.ts`
- Create: `packages/chord-sheet/src/alphatex.test.ts`
- Modify: `packages/chord-sheet/src/index.ts`

**Interfaces:**
- Produces:
  - `MIN_TEMPO`, `MAX_TEMPO`, `isTempo(value: number): boolean` (`tempo.ts`)
  - types `TabDuration`, `NoteEffects`, `TabNote`, `TabBeat`, `TabBar`, `TabBlock`, `TabBeatTime` (`tab.ts`)
  - `barQuarters(time: [number, number]): number`, `tabBeats(block: TabBlock): TabBeatTime[]`, `tabQuarters(block: TabBlock): number` (`tab.ts`)
  - `parseAlphaTex(lines: readonly string[], firstLineNo?: number): { block: TabBlock; diagnostics: Diagnostic[] }` (`alphatex.ts`)
  - `alphatexLine(source: string[])` — returns `{ type: 'alphatex'; source; block }` (typed as `Line` after Task 2; in this task return the object literal type)

- [ ] **Step 1: Write the failing tests**

`packages/chord-sheet/src/alphatex.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { parseAlphaTex } from './alphatex';
import { tabBeats, tabQuarters } from './tab';

const parseTex = (source: string, firstLineNo = 1) =>
  parseAlphaTex(source.split('\n'), firstLineNo);

const frets = (source: string) =>
  parseTex(source).block.bars.map((bar) =>
    bar.beats.map((beat) => beat.notes.map((n) => `${n.fret}.${n.string}`).join('+') || 'r'),
  );

const RIFF = [
  ':8 0.5 5.3 8.2 0.5 5.3 5.2 0.5 5.3 | 6.2 0.5 5.3 5.2 0.5 5.3 5.2 5.3 | 5.4 5.3 8.2 5.4 5.3 5.2 5.4 5.3 | 6.2 5.4 5.3 5.2 5.4 5.3 5.2 5.3 |',
  '',
  '3.4 5.3 3.1 3.4 5.3 5.2 3.4 5.3 | 6.2 3.4 5.3 5.2 3.4 5.3 5.2 5.3 | 5.5 7.4 0.3 5.5 7.4 0.3 5.5 7.4 | 5.5 7.4 0.3 5.5 7.4 0.3 5.5 7.4 |',
].join('\n');

describe('parseAlphaTex', () => {
  test('the riff: eighth notes, eight full bars, blank lines and a trailing bar line', () => {
    const { block, diagnostics } = parseTex(RIFF);
    expect(diagnostics).toEqual([]);
    expect(block.time).toEqual([4, 4]);
    expect(block.tempo).toBeNull();
    expect(block.bars).toHaveLength(8);
    expect(frets(RIFF)[0]).toEqual(['0.5', '5.3', '8.2', '0.5', '5.3', '5.2', '0.5', '5.3']);
    expect(block.bars.every((bar) => bar.beats.every((b) => b.duration === 8))).toBe(true);
    expect(block.playOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(tabQuarters(block)).toBe(32);
  });

  test('.N is for one beat, :N for all that follow; the default is a quarter', () => {
    const { block } = parseTex('0.6 8.2.16 5.3 :8 5.2 r');
    expect(block.bars[0]?.beats.map((b) => b.duration)).toEqual([4, 16, 4, 8, 8]);
  });

  test('dots and triplets change the length; a short bar is a warning', () => {
    const { block, diagnostics } = parseTex('0.6{d} :8 1.6{tu 3} 2.6{tu 3} 3.6{tu 3} 0.6');
    const beats = block.bars[0]?.beats ?? [];
    expect(beats.map((b) => b.quarters)).toEqual(
      [1.5, 1 / 3, 1 / 3, 1 / 3, 0.5].map((q) => expect.closeTo(q, 9)),
    );
    expect(beats[0]?.dotted).toBe(true);
    expect(beats[1]?.tuplet).toBe(3);
    expect(diagnostics).toEqual([
      { line: 1, col: 1, severity: 'warning', message: 'Bar 1: 3 of 4 quarter notes' },
    ]);
  });

  test('chords, rests, dead notes and ties', () => {
    const { block, diagnostics } = parseTex('(0.5 2.4).2 3.3 -.3 | x.6 r.2 r');
    expect(diagnostics).toEqual([]);
    const [chord, note, tie] = block.bars[0]?.beats ?? [];
    expect(chord?.notes.map((n) => [n.fret, n.string])).toEqual([
      [0, 5],
      [2, 4],
    ]);
    expect(chord?.duration).toBe(2);
    expect(note?.notes[0]?.tie).toBe(false);
    expect(tie?.notes[0]).toMatchObject({ fret: 3, string: 3, tie: true });
    const [dead, half, quarter] = block.bars[1]?.beats ?? [];
    expect(dead?.notes[0]?.fret).toBe('x');
    expect(half?.notes).toEqual([]);
    expect(half?.duration).toBe(2);
    expect(quarter?.duration).toBe(4);
  });

  test('effects on notes and beats', () => {
    const { block, diagnostics } = parseTex(
      '3.3{h} 5.3 7.2{sl} 9.2 | 7.3{b (0 4) v} 0.6{pm} 0.6{pm lr} (0.5{h} 2.4).4{txt "тише"}',
    );
    expect(diagnostics).toEqual([]);
    const [first, , third] = block.bars[0]?.beats ?? [];
    expect(first?.notes[0]?.effects).toEqual({ hammer: true });
    expect(third?.notes[0]?.effects).toEqual({ slide: true });
    const [bend, pm, pmLr, chord] = block.bars[1]?.beats ?? [];
    expect(bend?.notes[0]?.effects).toEqual({ bend: [0, 4], vibrato: true });
    expect(pm?.palmMute).toBe(true);
    expect(pmLr).toMatchObject({ palmMute: true, letRing: true });
    expect(chord?.text).toBe('тише');
    expect(chord?.notes[0]?.effects).toEqual({ hammer: true });
    expect(chord?.notes[1]?.effects).toEqual({});
  });

  test('lyrics go to beats that start a note; _ skips one', () => {
    const { block, diagnostics } = parseTex(
      '\\lyrics "Я за-бу-ду _ мя"\n:8 0.6 r 2.6 3.6 -.6 5.6 7.6 8.6',
    );
    expect(diagnostics).toEqual([]);
    expect(block.bars[0]?.beats.map((b) => b.syllable)).toEqual([
      'Я',
      null,
      'за-',
      'бу-',
      null,
      'ду',
      null,
      'мя',
    ]);
  });

  test('lyrics left over are a warning', () => {
    const { diagnostics } = parseTex('\\lyrics "раз два три"\n0.6 0.6 r r');
    expect(diagnostics).toEqual([
      { line: 1, col: 9, severity: 'warning', message: 'Syllables without notes: 1' },
    ]);
  });

  test('tempo and time signature', () => {
    const { block, diagnostics } = parseTex('\\tempo 140\n\\ts 3 4\n0.6 0.6 0.6');
    expect(diagnostics).toEqual([]);
    expect(block.tempo).toBe(140);
    expect(block.time).toEqual([3, 4]);
  });

  test('a tempo out of range is ignored', () => {
    const { block, diagnostics } = parseTex('\\tempo 500\n0.6.1');
    expect(block.tempo).toBeNull();
    expect(diagnostics).toEqual([
      { line: 1, col: 1, severity: 'warning', message: 'Tempo must be 30–300: 500' },
    ]);
  });

  test('repeats unroll into the play order', () => {
    const { block, diagnostics } = parseTex('\\ro 0.6.1 | \\rc 3 2.6.1 | 3.6.1');
    expect(diagnostics).toEqual([]);
    expect(block.bars[0]?.repeatOpen).toBe(true);
    expect(block.bars[1]?.repeatClose).toBe(3);
    expect(block.playOrder).toEqual([0, 1, 0, 1, 0, 1, 2]);
  });

  test('nested repeats are an error', () => {
    const { diagnostics } = parseTex('\\ro 0.6.1 | \\ro 2.6.1');
    expect(diagnostics).toContainEqual({
      line: 1,
      col: 13,
      severity: 'error',
      message: 'Nested repeats are not supported',
    });
  });

  test('problems point at the song line and column', () => {
    const { diagnostics } = parseAlphaTex(['0.6 0.6 0.6 0.6 |', '9.7 abc 0.6 {zz} 0.6'], 10);
    expect(diagnostics).toEqual([
      { line: 11, col: 1, severity: 'error', message: 'String must be 1–6: 9.7' },
      { line: 11, col: 5, severity: 'error', message: 'Not a note: abc' },
      { line: 11, col: 14, severity: 'warning', message: 'Unknown effect: zz' },
      { line: 11, col: 9, severity: 'warning', message: 'Bar 2: 2 of 4 quarter notes' },
    ]);
  });

  test('never throws', () => {
    for (const source of [
      '',
      '(',
      '{',
      '"',
      '\\',
      ':',
      '|',
      '-.1',
      '0.1{b (',
      '(0.1',
      '\\rc',
      '0.1.3',
      ':0',
      '0.1{txt}',
      '()',
      '\\lyrics',
    ]) {
      expect(() => parseTex(source)).not.toThrow();
    }
  });
});

describe('tabBeats', () => {
  test('beats in play order with their start in quarter notes', () => {
    const { block } = parseTex('\\ts 1 4\n\\ro :8 0.6 2.6 \\rc 2');
    expect(tabBeats(block)).toEqual([
      { bar: 0, beat: 0, start: 0, quarters: 0.5 },
      { bar: 0, beat: 1, start: 0.5, quarters: 0.5 },
      { bar: 0, beat: 0, start: 1, quarters: 0.5 },
      { bar: 0, beat: 1, start: 1.5, quarters: 0.5 },
    ]);
    expect(tabQuarters(block)).toBe(2);
  });

  test('an empty block has no bars and no length', () => {
    const { block, diagnostics } = parseTex('');
    expect(block.bars).toEqual([]);
    expect(diagnostics).toEqual([]);
    expect(tabQuarters(block)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/chord-sheet && bun test src/alphatex.test.ts`
Expected: FAIL — `Cannot find module './alphatex'`.

- [ ] **Step 3: Write `tempo.ts`**

```ts
export const MIN_TEMPO = 30;
export const MAX_TEMPO = 300;

export function isTempo(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TEMPO && value <= MAX_TEMPO;
}
```

- [ ] **Step 4: Write `tab.ts`**

```ts
export type TabDuration = 1 | 2 | 4 | 8 | 16 | 32;

/** `hammer` and `slide` lead to the next note on the same string; `bend` is in quarter tones. */
export type NoteEffects = { hammer?: true; slide?: true; bend?: number[]; vibrato?: true };

/** `string` 1 is the high E. A tie holds the previous fret on the string without a new attack. */
export type TabNote = { string: number; fret: number | 'x'; tie: boolean; effects: NoteEffects };

export type TabBeat = {
  /** Length in quarter notes, with the dot and the tuplet applied. */
  quarters: number;
  duration: TabDuration;
  dotted: boolean;
  tuplet: number | null;
  /** Empty for a rest. */
  notes: TabNote[];
  text: string | null;
  syllable: string | null;
  palmMute: boolean;
  letRing: boolean;
};

export type TabBar = { beats: TabBeat[]; repeatOpen: boolean; repeatClose: number | null };

export type TabBlock = {
  /** `\tempo`; `null` takes the section's or the song's. */
  tempo: number | null;
  time: [number, number];
  /** As written, for drawing with repeat signs. */
  bars: TabBar[];
  /** Indices into `bars` with repeats unrolled, for time and sound. */
  playOrder: number[];
};

export type TabBeatTime = {
  /** Index into `bars`. */
  bar: number;
  /** Index into the bar's beats. */
  beat: number;
  /** Quarter notes from the start of the block. */
  start: number;
  quarters: number;
};

/** Quarter notes in a bar of `n/m`. */
export function barQuarters(time: [number, number]): number {
  return (time[0] * 4) / time[1];
}

/** Every beat in play order (repeats unrolled) with its start. */
export function tabBeats(block: TabBlock): TabBeatTime[] {
  const beats: TabBeatTime[] = [];
  let at = 0;
  for (const bar of block.playOrder) {
    block.bars[bar]?.beats.forEach((beat, index) => {
      beats.push({ bar, beat: index, start: at, quarters: beat.quarters });
      at += beat.quarters;
    });
  }
  return beats;
}

/** Length of the block in quarter notes, repeats included. */
export function tabQuarters(block: TabBlock): number {
  let total = 0;
  for (const bar of block.playOrder) {
    for (const beat of block.bars[bar]?.beats ?? []) {
      total += beat.quarters;
    }
  }
  return total;
}
```

- [ ] **Step 5: Write `alphatex.ts`**

```ts
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
      report(token, 'error', `Unexpected ${token.kind === 'str' ? `"${token.value}"` : token.value}`);
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
```

Notes for the implementer:
- In the `lyrics left over` test the diagnostic column is the `"` of the string token (`\lyrics "…"` → col 9).
- In the `problems point at` test the bar warning points at the first beat of bar 2 (`0.6` at col 9), because `barAt` moves to the first successful beat.

- [ ] **Step 6: Export the new modules**

`packages/chord-sheet/src/index.ts` — add, keeping alphabetical order:

```ts
export * from './alphatex';
export * from './tab';
export * from './tempo';
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `cd packages/chord-sheet && bun test src/alphatex.test.ts`
Expected: PASS (all tests).

- [ ] **Step 8: Commit**

```bash
git add packages/chord-sheet/src/tempo.ts packages/chord-sheet/src/tab.ts packages/chord-sheet/src/alphatex.ts packages/chord-sheet/src/alphatex.test.ts packages/chord-sheet/src/index.ts
git commit -m "Add alphaTex tab model and parser

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: alphaTex blocks and section tempo in the song document

**Files:**
- Modify: `packages/chord-sheet/src/types.ts`
- Modify: `packages/chord-sheet/src/parse.ts`
- Modify: `packages/chord-sheet/src/serialize.ts`
- Modify: `packages/chord-sheet/src/chords-over-lyrics.ts`
- Modify: `packages/chord-sheet/src/validate.ts`
- Modify: `packages/chord-sheet/src/alphatex.ts` (return type of `alphatexLine`)
- Modify: `apps/web/src/features/editor/doc-edit.ts` (`addSection` gets `tempo: null`)
- Test: `packages/chord-sheet/src/parse.test.ts`, `packages/chord-sheet/src/chords-over-lyrics.test.ts`

**Interfaces:**
- Consumes: `parseAlphaTex`, `TabBlock`, `isTempo`, `MIN_TEMPO`, `MAX_TEMPO` (Task 1).
- Produces:
  - `Line` gains `{ type: 'alphatex'; source: string[]; block: TabBlock }`; `Section` gains `tempo: number | null`.
  - `ALPHATEX_START = '{start_of_alphatex}'`, `ALPHATEX_END = '{end_of_alphatex}'`.
  - `type Header = { label: string; rhythm: string | null; tempo: number | null }`; `parseHeader(text): Header | null` (tempo as written).
  - `sectionFromHeader(header: Header, lineNo: number, diagnostics: Diagnostic[]): Section`.
  - `isBlockStart(text: string): boolean`; `readBlock(lines, start, diagnostics): { line: Line; end: number }`.
  - `serializeBlock(line: Exclude<Line, { type: 'line' }>): string[]`; `serializeHeader` writes ` NNNbpm`.
  - `alphatexLine(source: string[]): Line`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/chord-sheet/src/parse.test.ts`:

```ts
describe('alphaTex blocks and section tempo', () => {
  const SOURCE = [
    '[Соло] @A 140bpm',
    '{start_of_alphatex}',
    '\\tempo 120',
    ':8 0.5 5.3',
    '{end_of_alphatex}',
    '${Am}la',
  ].join('\n');

  test('parses the block and the section tempo', () => {
    const { doc, diagnostics } = parse(SOURCE);
    expect(diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const section = doc.sections[0];
    expect(section).toMatchObject({ label: 'Соло', rhythm: 'A', tempo: 140 });
    const block = section?.lines[0];
    expect(block?.type).toBe('alphatex');
    expect(block?.type === 'alphatex' && block.source).toEqual(['\\tempo 120', ':8 0.5 5.3']);
    expect(block?.type === 'alphatex' && block.block.tempo).toBe(120);
  });

  test('round-trips through serialize', () => {
    expect(serialize(parse(SOURCE).doc)).toBe(SOURCE);
  });

  test('alphaTex problems point at song lines', () => {
    const { diagnostics } = parse(
      ['[Соло]', '{start_of_alphatex}', '0.6 9.9', '{end_of_alphatex}'].join('\n'),
    );
    expect(diagnostics).toContainEqual({
      line: 3,
      col: 5,
      severity: 'error',
      message: 'String must be 1–6: 9.9',
    });
  });

  test('tempo without a rhythm; out of range is dropped', () => {
    expect(parse('[Бридж] 72bpm').doc.sections[0]?.tempo).toBe(72);
    const { doc, diagnostics } = parse('[Бридж] 999bpm');
    expect(doc.sections[0]?.tempo).toBeNull();
    expect(diagnostics).toEqual([
      { line: 1, col: 1, severity: 'warning', message: 'Tempo must be 30–300: 999' },
    ]);
  });

  test('an unclosed alphaTex block is an error', () => {
    expect(parse('{start_of_alphatex}\n0.6').diagnostics).toContainEqual({
      line: 1,
      col: 1,
      severity: 'error',
      message: 'Unclosed {start_of_alphatex}',
    });
  });

  test('validate counts block lines', () => {
    const { doc } = parse(['{start_of_alphatex}', '0.6', '{end_of_alphatex}', '@Z text'].join('\n'));
    expect(validate(doc, [])).toEqual([
      { line: 4, col: 1, severity: 'error', message: 'Unknown rhythm: Z' },
    ]);
  });

  test('ASCII tabs are untouched', () => {
    const source = '{start_of_tab}\ne|--0--|\n{end_of_tab}';
    expect(parse(source).doc.sections[0]?.lines[0]).toEqual({ type: 'tab', lines: ['e|--0--|'] });
    expect(serialize(parse(source).doc)).toBe(source);
  });
});
```

Append to `packages/chord-sheet/src/chords-over-lyrics.test.ts` (inside `describe('toChordsOverLyrics', …)` or a new `describe`):

```ts
test('alphaTex blocks and section tempo pass through untouched', () => {
  const text = ['[Соло] 140bpm', '{start_of_alphatex}', ':8 0.5 5.3 | 3.3', '{end_of_alphatex}'].join('\n');
  const { doc } = fromChordsOverLyrics(text);
  expect(doc.sections[0]?.tempo).toBe(140);
  expect(doc.sections[0]?.lines[0]).toMatchObject({ type: 'alphatex', source: [':8 0.5 5.3 | 3.3'] });
  expect(toChordsOverLyrics(doc)).toBe(text);
});
```

In the existing tests, add `tempo: null` to the Section literals that are compared with `toEqual` or assigned: `parse.test.ts` test `example document` (the section object after `rhythm: 'B'`, and any other section objects in that expectation) and `chords-over-lyrics.test.ts` around line 91 (`label: null, rhythm: null,` → add `tempo: null,`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/chord-sheet && bun test src/parse.test.ts src/chords-over-lyrics.test.ts`
Expected: FAIL — `tempo` undefined, alphaTex blocks parsed as text lines.

- [ ] **Step 3: Update `types.ts`**

```ts
import type { TabBlock } from './tab';
```

```ts
/** A line without chord, bar, rhythm or repeat items is plain text. */
export type Line =
  | { type: 'line'; items: Item[] }
  /** ASCII tab: shown as is, takes no time. */
  | { type: 'tab'; lines: string[] }
  | { type: 'alphatex'; source: string[]; block: TabBlock };

/** `tempo` overrides the song tempo for this section only. */
export type Section = {
  label: string | null;
  rhythm: string | null;
  tempo: number | null;
  lines: Line[];
};
```

- [ ] **Step 4: Update `parse.ts`**

Replace the constants and `parseHeader` at the top, add the block helpers, and use them in `parse()`:

```ts
import { parseAlphaTex } from './alphatex';
import { isChord } from './chord';
import { isTempo, MAX_TEMPO, MIN_TEMPO } from './tempo';
import type { Diagnostic, Item, Line, Section, SongDoc } from './types';

const META_RE = /^\{(\w+):\s*(.*?)\s*\}$/;
const HEADER_RE = /^\[([^\]]+)\](?:\s*@([A-Z]))?(?:\s*(\d+)\s*bpm)?\s*$/;
const REPEAT_RE = /^[x×]([1-9]\d*)$/;
const RHYTHM_KEY_RE = /[A-Z]/;

export const TAB_START = '{start_of_tab}';
export const TAB_END = '{end_of_tab}';
export const ALPHATEX_START = '{start_of_alphatex}';
export const ALPHATEX_END = '{end_of_alphatex}';

export type Header = { label: string; rhythm: string | null; tempo: number | null };

/** `[Соло] @B 140bpm`. The tempo is as written; `sectionFromHeader` checks its range. */
export function parseHeader(text: string): Header | null {
  const match = HEADER_RE.exec(text);
  return match
    ? {
        label: match[1] ?? '',
        rhythm: match[2] ?? null,
        tempo: match[3] ? Number(match[3]) : null,
      }
    : null;
}

/** A new section from its header; a tempo out of range is dropped with a warning. */
export function sectionFromHeader(
  header: Header,
  lineNo: number,
  diagnostics: Diagnostic[],
): Section {
  let { tempo } = header;
  if (tempo !== null && !isTempo(tempo)) {
    diagnostics.push({
      line: lineNo,
      col: 1,
      severity: 'warning',
      message: `Tempo must be ${MIN_TEMPO}–${MAX_TEMPO}: ${tempo}`,
    });
    tempo = null;
  }
  return { ...header, tempo, lines: [] };
}

export function isBlockStart(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === TAB_START || trimmed === ALPHATEX_START;
}

/**
 * Reads the block opened at `lines[start]` (`{start_of_tab}` or `{start_of_alphatex}`).
 * `end` is the index of the closing fence, or of the last line when it is missing.
 */
export function readBlock(
  lines: readonly string[],
  start: number,
  diagnostics: Diagnostic[],
): { line: Line; end: number } {
  const open = (lines[start] ?? '').trim();
  const close = open === TAB_START ? TAB_END : ALPHATEX_END;
  const body: string[] = [];
  let end = start + 1;
  for (; end < lines.length; end++) {
    const text = lines[end] ?? '';
    if (text.trim() === close) {
      break;
    }
    body.push(text);
  }
  if (end >= lines.length) {
    diagnostics.push({ line: start + 1, col: 1, severity: 'error', message: `Unclosed ${open}` });
    end = lines.length - 1;
  }
  if (open === TAB_START) {
    return { line: { type: 'tab', lines: body }, end };
  }
  const parsed = parseAlphaTex(body, start + 2);
  diagnostics.push(...parsed.diagnostics);
  return { line: { type: 'alphatex', source: body, block: parsed.block }, end };
}
```

In `parse()`:

```ts
  let current: Section = { label: null, rhythm: null, tempo: null, lines: [] };
```

and replace the header branch and the whole `if (text.trim() === TAB_START) { … }` branch with:

```ts
    const header = parseHeader(text);
    if (header) {
      current = sectionFromHeader(header, i + 1, diagnostics);
      sections.push(current);
      continue;
    }
    if (isBlockStart(text)) {
      const block = readBlock(lines, i, diagnostics);
      current.lines.push(block.line);
      i = block.end;
      continue;
    }
```

- [ ] **Step 5: Update `serialize.ts`**

```ts
import { ALPHATEX_END, ALPHATEX_START, TAB_END, TAB_START } from './parse';
import type { Item, Line, Section, SongDoc } from './types';
```

```ts
export function serializeHeader(section: Section): string {
  const rhythm = section.rhythm ? ` @${section.rhythm}` : '';
  const tempo = section.tempo ? ` ${section.tempo}bpm` : '';
  return `[${section.label ?? ''}]${rhythm}${tempo}`;
}

/** A tab or alphaTex block with its fences. */
export function serializeBlock(line: Exclude<Line, { type: 'line' }>): string[] {
  return line.type === 'tab'
    ? [TAB_START, ...line.lines, TAB_END]
    : [ALPHATEX_START, ...line.source, ALPHATEX_END];
}
```

and in `serialize()`:

```ts
    for (const line of section.lines) {
      if (line.type === 'line') {
        out.push(line.items.map(serializeItem).join(''));
      } else {
        out.push(...serializeBlock(line));
      }
    }
```

- [ ] **Step 6: Update `chords-over-lyrics.ts`**

Imports: `import { isBlockStart, parseHeader, parseMeta, readBlock, sectionFromHeader } from './parse';` and `import { serializeBlock, serializeHeader } from './serialize';` (drop `TAB_END`, `TAB_START` if no longer used).

In `isLyric`, replace `line.trim() !== TAB_START` with `!isBlockStart(line)`.

In `fromChordsOverLyrics`: the initial section becomes `{ label: null, rhythm: null, tempo: null, lines: [] }`; the header branch becomes

```ts
    const header = parseHeader(line);
    if (header) {
      current = sectionFromHeader(header, i + 1, diagnostics);
      sections.push(current);
      continue;
    }
```

and the whole `if (line.trim() === TAB_START) { … }` branch becomes

```ts
    if (isBlockStart(line)) {
      const block = readBlock(lines, i, diagnostics);
      current.lines.push(block.line);
      i = block.end;
      continue;
    }
```

In `toChordsOverLyrics`:

```ts
    for (const line of section.lines) {
      if (line.type === 'line') {
        out.push(...renderLine(line.items));
      } else {
        out.push(...serializeBlock(line));
      }
    }
```

- [ ] **Step 7: Update `validate.ts`**

```ts
    for (const line of section.lines) {
      if (line.type !== 'line') {
        lineNo += (line.type === 'tab' ? line.lines.length : line.source.length) + 2;
        continue;
      }
```

- [ ] **Step 8: Type `alphatexLine` and fix `addSection`**

`packages/chord-sheet/src/alphatex.ts`: `import type { Diagnostic, Line } from './types';` and

```ts
export function alphatexLine(source: string[]): Line {
  return { type: 'alphatex', source, block: parseAlphaTex(source).block };
}
```

`apps/web/src/features/editor/doc-edit.ts`:

```ts
  const section: Section = { label, rhythm: null, tempo: null, lines: [{ type: 'line', items: [] }] };
```

- [ ] **Step 9: Run tests and types**

Run: `cd packages/chord-sheet && bun test`
Expected: PASS (all chord-sheet tests, old and new).
Run: `bunx turbo run check-types --filter=@chordtune/chord-sheet`
Expected: no errors. (Web type errors from `line.type === 'tab'` checks that now also meet `alphatex` are fixed in Tasks 7–9; the web app still compiles because those branches fall through to `LineView` only for `'line'` — if `tsc` in `apps/web` reports `items` missing on `alphatex`, leave it for Task 7, which touches all three places.)

- [ ] **Step 10: Commit**

```bash
git add packages/chord-sheet/src apps/web/src/features/editor/doc-edit.ts
git commit -m "Parse alphaTex blocks and section tempo in songs

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tab events and tempo in the timeline

**Files:**
- Modify: `packages/chord-sheet/src/timeline.ts`
- Test: `packages/chord-sheet/src/timeline.test.ts`

**Interfaces:**
- Consumes: `Line` `alphatex`, `Section.tempo` (Task 2); `tabQuarters`, `barQuarters`, `TabBlock` (Task 1).
- Produces:
  - `type ChordEvent = { kind: 'chord'; chord: string; rhythm: string | null; tempo: number | null; bar; start; length; section; line; item }`
  - `type TabEvent = { kind: 'tab'; block: TabBlock; tempo: number | null; bar; start; length; section; line }`
  - `type TimelineEvent = ChordEvent | TabEvent`; `timeline(doc, rhythms): TimelineEvent[]` (same signature).

- [ ] **Step 1: Write the failing tests**

In `timeline.test.ts`, change the `events` helper to keep only chord events:

```ts
function events(source: string, rhythms: Rhythm[] = RHYTHMS) {
  return timeline(parse(source).doc, rhythms).flatMap((event) =>
    event.kind === 'chord'
      ? [
          {
            chord: event.chord,
            rhythm: event.rhythm,
            bar: event.bar,
            start: event.start,
            length: event.length,
          },
        ]
      : [],
  );
}
```

Append:

```ts
describe('timeline with tabs and tempo', () => {
  const block = (body: string[]) => ['{start_of_alphatex}', ...body, '{end_of_alphatex}'];

  test('an alphaTex block takes its bars and the chords after it follow', () => {
    const doc = parse(
      ['${Am}a', ...block([':8 0.5 5.3 8.2 0.5 5.3 5.2 0.5 5.3 | 0.6.2 0.6.2']), '${G}b'].join('\n'),
    ).doc;
    expect(timeline(doc, RHYTHMS).map((e) => [e.kind, e.start, e.length, e.line])).toEqual([
      ['chord', 0, 1, 0],
      ['tab', 1, 2, 1],
      ['chord', 3, 1, 2],
    ]);
  });

  test('bars of a 3/4 block have three quarters', () => {
    const doc = parse(block(['\\ts 3 4', '0.6 0.6 0.6 | 0.6 0.6 0.6']).join('\n')).doc;
    expect(timeline(doc, RHYTHMS)[0]).toMatchObject({ kind: 'tab', length: 2 });
  });

  test('tempo: the block, else the section, else the song (null)', () => {
    const doc = parse(
      [
        '[A] 140bpm',
        '${Am}a',
        ...block(['0.6.1']),
        ...block(['\\tempo 70', '0.6.1']),
        '[B]',
        '${G}b',
      ].join('\n'),
    ).doc;
    expect(timeline(doc, RHYTHMS).map((e) => e.tempo)).toEqual([140, 140, 70, null]);
  });

  test('empty blocks take no time', () => {
    const doc = parse([...block([]), '${Am}a'].join('\n')).doc;
    expect(timeline(doc, RHYTHMS).map((e) => [e.kind, e.start])).toEqual([['chord', 0]]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/chord-sheet && bun test src/timeline.test.ts`
Expected: FAIL — no `kind`/`tempo` on events, no tab events.

- [ ] **Step 3: Implement**

`timeline.ts`:

```ts
import type { Rhythm } from './rhythm';
import { barQuarters, type TabBlock, tabQuarters } from './tab';
import type { Item, SongDoc } from './types';

type Place = {
  /** Bar number from 0. */
  bar: number;
  /** Start and length in bars (of the rhythm's time for chords, of the block's for tabs). */
  start: number;
  length: number;
  section: number;
  line: number;
  /** `\tempo` of a block, else the section's; `null` takes the song's. */
  tempo: number | null;
};

export type ChordEvent = Place & {
  kind: 'chord';
  chord: string;
  /** Key of the rhythm pattern, `null` when the song has none. */
  rhythm: string | null;
  /** Index of the chord item in its line. */
  item: number;
};

export type TabEvent = Place & { kind: 'tab'; block: TabBlock };

export type TimelineEvent = ChordEvent | TabEvent;

type Unplaced = Omit<ChordEvent, 'bar'> | Omit<TabEvent, 'bar'>;
```

Keep `groups()` as is. In `timeline()`:

```ts
  const push = (event: Unplaced) => {
    events.push({ ...event, bar: Math.floor(event.start + 1e-9) } as TimelineEvent);
    position = event.start + event.length;
  };
```

Inside `section.lines.forEach((line, lineIndex) => {`:

```ts
      if (line.type === 'tab') {
        return;
      }
      if (line.type === 'alphatex') {
        const quarters = tabQuarters(line.block);
        if (quarters > 0) {
          push({
            kind: 'tab',
            block: line.block,
            tempo: line.block.tempo ?? section.tempo,
            start: position,
            length: quarters / barQuarters(line.block.time),
            section: sectionIndex,
            line: lineIndex,
          });
        }
        return;
      }
```

The chord push becomes:

```ts
            push({
              kind: 'chord',
              chord: item.chord,
              rhythm,
              tempo: section.tempo,
              start: position,
              length,
              section: sectionIndex,
              line: lineIndex,
              item: index,
            });
```

The repeat loop stays as is (`push({ ...event, start: … })` — `phrase` elements are `TimelineEvent`s and spread fine into `Unplaced`; the stale `bar` is overwritten by `push`).

Update the doc comment of `timeline()` with one sentence: "alphaTex blocks become one tab event each, as long as their bars; ASCII tabs take no time."

- [ ] **Step 4: Run tests**

Run: `cd packages/chord-sheet && bun test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/chord-sheet/src/timeline.ts packages/chord-sheet/src/timeline.test.ts
git commit -m "Put alphaTex blocks and section tempo into the timeline

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Scheduling tabs, tempo per event and capo

**Files:**
- Create: `packages/audio/src/tab-schedule.ts`
- Create: `packages/audio/src/tab-schedule.test.ts`
- Modify: `packages/audio/src/strum-schedule.ts`
- Modify: `packages/audio/src/strum-schedule.test.ts`
- Modify: `packages/audio/src/index.ts`

**Interfaces:**
- Consumes: `TimelineEvent`/`ChordEvent`/`TabEvent` (Task 3), `TabBlock`, `tabBeats`, `tabQuarters`, `parseAlphaTex` (Task 1).
- Produces:
  - `scheduleTab(block: TabBlock, options: { bpm: number; capo?: number }): ScheduledNote[]` — times from the block start.
  - `ScheduleOptions` gains `capo?: number`.
  - `eventSeconds(events, rhythms, bpm)` — same signature, uses `event.tempo ?? bpm`, tab length from its quarters.
  - `scheduleNotes(events, rhythms, options)` — also plays tab events.

- [ ] **Step 1: Write the failing tests**

`packages/audio/src/tab-schedule.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parseAlphaTex } from '@chordtune/chord-sheet';

import { scheduleTab } from './tab-schedule';

const block = (source: string) => parseAlphaTex(source.split('\n')).block;

describe('scheduleTab', () => {
  test('pitch from the string, fret and capo; time from the durations', () => {
    const notes = scheduleTab(block(':8 0.6 5.3 (0.5 2.4).4'), { bpm: 60, capo: 2 });
    expect(notes.map((n) => [n.time, n.midi, n.string])).toEqual([
      [0, 42, 6],
      [0.5, 62, 3],
      [1, 47, 5],
      [1, 54, 4],
    ]);
  });

  test('ties ring on, dead notes and palm mute are muted, legato is softer', () => {
    const notes = scheduleTab(block('3.3{h} 5.3 -.3 x.6 0.6{pm}'), { bpm: 60 });
    expect(notes.map((n) => [n.time, n.midi, n.muted])).toEqual([
      [0, 58, false],
      [1, 60, false],
      [3, 40, true],
      [4, 40, true],
    ]);
    expect(notes[1]?.gain ?? 1).toBeLessThan(notes[0]?.gain ?? 0);
  });

  test('repeats play again', () => {
    expect(scheduleTab(block('\\ro 0.6.2 \\rc 2'), { bpm: 60 }).map((n) => n.time)).toEqual([0, 2]);
  });
});
```

In `strum-schedule.test.ts`, update the `event` helper to return a chord event:

```ts
const event = (
  chord: string,
  start: number,
  length: number,
  rhythm: string | null = 'A',
): TimelineEvent => ({
  kind: 'chord',
  chord,
  rhythm,
  tempo: null,
  bar: Math.floor(start),
  start,
  length,
  section: 0,
  line: 0,
  item: 0,
});
```

and add (import `parseAlphaTex` from `@chordtune/chord-sheet`):

```ts
describe('tabs and tempo', () => {
  test('a tab event plays in its tempo and pushes the next chord', () => {
    const tab = parseAlphaTex(['\\tempo 120', '0.6 0.6 0.6 0.6']).block;
    const events: TimelineEvent[] = [
      event('Am', 0, 1),
      { kind: 'tab', block: tab, tempo: 120, bar: 1, start: 1, length: 1, section: 0, line: 1 },
      event('G', 2, 1),
    ];
    expect(eventSeconds(events, [preset('six')], 60)).toEqual([
      { start: 0, end: 4 },
      { start: 4, end: 6 },
      { start: 6, end: 10 },
    ]);
    const notes = scheduleNotes(events, [preset('six')], { bpm: 60 });
    expect(notes.filter((n) => n.time >= 4 && n.time < 6).map((n) => [n.time, n.midi])).toEqual([
      [4, 40],
      [4.5, 40],
      [5, 40],
      [5.5, 40],
    ]);
  });

  test('a section tempo changes the bar length', () => {
    expect(eventSeconds([{ ...event('Am', 0, 1), tempo: 120 }], [preset('six')], 60)).toEqual([
      { start: 0, end: 2 },
    ]);
  });

  test('capo raises every chord note', () => {
    const plain = scheduleNotes([event('Am', 0, 1)], [preset('six')], { bpm: 60 });
    const capo = scheduleNotes([event('Am', 0, 1)], [preset('six')], { bpm: 60, capo: 3 });
    expect(capo.map((n) => n.midi)).toEqual(plain.map((n) => n.midi + 3));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/audio && bun test src/tab-schedule.test.ts src/strum-schedule.test.ts`
Expected: FAIL — `./tab-schedule` missing; tab events ignored.

- [ ] **Step 3: Write `tab-schedule.ts`**

```ts
import { type TabBlock, tabBeats } from '@chordtune/chord-sheet';

import { OPEN_STRING_MIDI } from './guitar-synth';
import type { ScheduledNote } from './strum-schedule';

const TAB_GAIN = 0.9;
const DEAD_GAIN = 0.8;
const PALM_MUTE_GAIN = 0.7;
/** A note reached by a hammer-on, pull-off or slide is not picked. */
const LEGATO_GAIN = 0.55;

/**
 * Tab notes in time from the start of the block (repeats unrolled). Tied notes ring on,
 * dead notes and palm mute are muted, the target of `h`/`sl` sounds softer.
 */
export function scheduleTab(
  block: TabBlock,
  options: { bpm: number; capo?: number },
): ScheduledNote[] {
  const quarterSec = 60 / options.bpm;
  const capo = options.capo ?? 0;
  const legato = new Set<number>();
  const notes: ScheduledNote[] = [];

  for (const { bar, beat: beatIndex, start } of tabBeats(block)) {
    const beat = block.bars[bar]?.beats[beatIndex];
    if (!beat) {
      continue;
    }
    for (const note of beat.notes) {
      if (note.tie) {
        continue;
      }
      const dead = note.fret === 'x';
      let gain = dead ? DEAD_GAIN : TAB_GAIN;
      if (beat.palmMute) {
        gain *= PALM_MUTE_GAIN;
      }
      if (legato.delete(note.string)) {
        gain *= LEGATO_GAIN;
      }
      if (note.effects.hammer || note.effects.slide) {
        legato.add(note.string);
      }
      const open = OPEN_STRING_MIDI[6 - note.string] ?? OPEN_STRING_MIDI[0];
      notes.push({
        time: start * quarterSec,
        midi: open + (note.fret === 'x' ? 0 : note.fret) + capo,
        string: note.string,
        gain,
        muted: dead || beat.palmMute,
      });
    }
  }
  return notes;
}
```

- [ ] **Step 4: Update `strum-schedule.ts`**

Imports:

```ts
import {
  barBeats,
  type ChordEvent,
  type Rhythm,
  type Step,
  type StringRef,
  type TimelineEvent,
  tabQuarters,
} from '@chordtune/chord-sheet';

import { type GuitarFrets, OPEN_STRING_MIDI } from './guitar-synth';
import { scheduleTab } from './tab-schedule';
import { voicingFor } from './voicing';
```

```ts
export type ScheduleOptions = {
  bpm: number;
  /** Frets the capo raises every note by. */
  capo?: number;
  voicing?: (chord: string) => GuitarFrets | null;
};
```

`rhythmOf(event: ChordEvent, …)`. Replace `eventSeconds`:

```ts
function eventLength(event: TimelineEvent, rhythms: readonly Rhythm[], bpm: number): number {
  const tempo = event.tempo ?? bpm;
  return event.kind === 'tab'
    ? (tabQuarters(event.block) * 60) / tempo
    : event.length * barSeconds(rhythmOf(event, rhythms), tempo);
}

/** Start and end of each event in seconds; events play back to back from 0. */
export function eventSeconds(
  events: readonly TimelineEvent[],
  rhythms: readonly Rhythm[],
  bpm: number,
): { start: number; end: number }[] {
  let cursor = 0;
  return events.map((event) => {
    const start = cursor;
    cursor += eventLength(event, rhythms, bpm);
    return { start, end: cursor };
  });
}
```

In `scheduleNotes`:

```ts
  const voicing = options.voicing ?? voicingFor;
  const capo = options.capo ?? 0;
  const seconds = eventSeconds(events, rhythms, options.bpm);
  const notes: ScheduledNote[] = [];

  events.forEach((event, index) => {
    const offset = seconds[index]?.start ?? 0;
    if (event.kind === 'tab') {
      for (const note of scheduleTab(event.block, { bpm: event.tempo ?? options.bpm, capo })) {
        notes.push({ ...note, time: note.time + offset });
      }
      return;
    }
    const frets = voicing(event.chord);
    if (!frets) {
      return;
    }
    const rhythm = rhythmOf(event, rhythms);
    const barSec = barSeconds(rhythm, event.tempo ?? options.bpm);
    const end = event.start + event.length;
    const stepCount = rhythm.steps.length;

    for (let bar = Math.floor(event.start + EPSILON); bar < end - EPSILON; bar++) {
      rhythm.steps.forEach((step, i) => {
        const at = bar + i / stepCount;
        if (step && at >= event.start - EPSILON && at < end - EPSILON) {
          const time = offset + (at - event.start) * barSec;
          notes.push(...playStep(step, rhythm.kind, frets, time, capo));
        }
      });
    }
  });
```

Thread `capo` through `playStep(step, kind, frets, time, capo)` into `note(index, fret, time, gain, muted, capo)`:

```ts
function note(index: number, fret: number, time: number, gain: number, muted: boolean, capo: number) {
  return {
    time,
    midi: (OPEN_STRING_MIDI[index] ?? OPEN_STRING_MIDI[0]) + fret + capo,
    string: 6 - index,
    gain,
    muted,
  };
}
```

Every `note(…)` call inside `playStep` passes `capo` as the last argument.

- [ ] **Step 5: Export**

`packages/audio/src/index.ts`: add `export * from './tab-schedule';` after `./strum-schedule`.

- [ ] **Step 6: Run tests and types**

Run: `cd packages/audio && bun test`
Expected: PASS.
Run: `bunx turbo run check-types --filter=@chordtune/audio --filter=@chordtune/chord-sheet`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/audio/src
git commit -m "Schedule tab blocks, per-section tempo and capo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Web playback options, speed and zen timing with tabs

**Files:**
- Modify: `apps/web/src/features/rhythm/playback.ts`
- Create: `apps/web/src/features/rhythm/playback.test.ts`
- Modify: `apps/web/src/features/rhythm/rhythm-editor-sheet.tsx` (3 call sites)
- Modify: `apps/web/src/features/zen/zen-timing.ts`
- Modify: `apps/web/src/features/zen/zen-timing.test.ts`
- Modify: `apps/web/src/features/song/song-view.tsx`, `apps/web/src/features/editor/chord-editor.tsx` (call sites only, to keep compiling)

**Interfaces:**
- Consumes: `scheduleTab`, `eventSeconds`, `scheduleNotes` with `capo` (Task 4); `timeline`, `tabBeats`, `TabBlock` (Tasks 1, 3).
- Produces (`playback.ts`):
  - `type PlaybackOptions = { bpm: number; capo?: number | null; speed?: number }`
  - `type SongPlayback = { events: TimelineEvent[]; seconds: { start: number; end: number }[]; beatStarts: (number[] | null)[]; notes: ScheduledNote[] }`
  - `type ActiveBeat = { bar: number; beat: number }`
  - `type PlayingAt = { section: number; line: number; item: number | null; beat: ActiveBeat | null }`
  - `patternPlayback(rhythm, chord, options: PlaybackOptions): { notes; loopSec }`
  - `songPlayback(doc, rhythms, options): SongPlayback`
  - `sectionPlayback(doc, rhythms, section, options): SongPlayback`
  - `tabPlayback(block, options): { notes: ScheduledNote[]; beats: TabBeatTime[]; beatStarts: number[] }` (uses `block.tempo ?? options.bpm`)
  - `playingAt(playback: SongPlayback, position: number): PlayingAt | null`
  - `beatAt(playback: { beats: TabBeatTime[]; beatStarts: number[] }, position: number): ActiveBeat | null`
- Produces (`zen-timing.ts`): `zenLines(doc, rhythms, bpm)` also returns tab lines, where `chordStarts` are beat starts and `chordItems` are beat indices in `tabBeats(block)` order.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/rhythm/playback.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse } from '@chordtune/chord-sheet';

import { beatAt, playingAt, songPlayback, tabPlayback } from './playback';

const doc = parse(
  ['${Am}a', '{start_of_alphatex}', '0.6 0.6 0.6 0.6', '{end_of_alphatex}'].join('\n'),
).doc;

describe('songPlayback', () => {
  test('speed divides every time', () => {
    const normal = songPlayback(doc, [], { bpm: 60 });
    const slow = songPlayback(doc, [], { bpm: 60, speed: 0.5 });
    expect(slow.seconds).toEqual(
      normal.seconds.map(({ start, end }) => ({ start: start * 2, end: end * 2 })),
    );
    expect(slow.notes.map((n) => n.time)).toEqual(normal.notes.map((n) => n.time * 2));
  });

  test('playingAt finds the chord or the tab beat', () => {
    const playback = songPlayback(doc, [], { bpm: 60 });
    expect(playingAt(playback, 1)).toEqual({ section: 0, line: 0, item: 0, beat: null });
    expect(playingAt(playback, 6.5)).toEqual({
      section: 0,
      line: 1,
      item: null,
      beat: { bar: 0, beat: 2 },
    });
    expect(playingAt(playback, 99)).toBeNull();
  });

  test('tab-only song has notes', () => {
    const tabOnly = parse('{start_of_alphatex}\n0.6 0.6\n{end_of_alphatex}').doc;
    expect(songPlayback(tabOnly, [], { bpm: 60 }).notes.map((n) => n.time)).toEqual([0, 1]);
  });

  test('capo shifts the song', () => {
    const plain = songPlayback(doc, [], { bpm: 60 }).notes.map((n) => n.midi);
    const capo = songPlayback(doc, [], { bpm: 60, capo: 2 }).notes.map((n) => n.midi);
    expect(capo).toEqual(plain.map((midi) => midi + 2));
  });
});

describe('tabPlayback', () => {
  test('the block tempo wins, speed scales, beatAt follows', () => {
    const block = parse('{start_of_alphatex}\n\\tempo 120\n0.6 0.6\n{end_of_alphatex}').doc
      .sections[0]?.lines[0];
    if (block?.type !== 'alphatex') {
      throw new Error('expected a block');
    }
    const playback = tabPlayback(block.block, { bpm: 60, speed: 2 });
    expect(playback.beatStarts).toEqual([0, 0.25]);
    expect(playback.notes.map((n) => n.time)).toEqual([0, 0.25]);
    expect(beatAt(playback, 0.3)).toEqual({ bar: 0, beat: 1 });
  });
});
```

Append to `zen-timing.test.ts` inside `describe('zenLines', …)`:

```ts
  test('alphaTex blocks are lines with a start per beat', () => {
    const lines = zenLines(
      doc('${Am}a\n{start_of_alphatex}\n\\tempo 120\n:8 0.6 0.6 r.4 0.6.2\n{end_of_alphatex}'),
      [],
      60,
    );
    expect(lines[1]).toEqual({
      section: 0,
      line: 1,
      start: 4,
      end: 6,
      chordStarts: [4, 4.25, 4.5, 5],
      chordItems: [0, 1, 2, 3],
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bun test src/features/rhythm/playback.test.ts src/features/zen/zen-timing.test.ts`
Expected: FAIL — `playingAt`, `tabPlayback` missing; zen has no tab line.

- [ ] **Step 3: Rewrite `playback.ts`**

```ts
import { eventSeconds, type ScheduledNote, scheduleNotes, scheduleTab } from '@chordtune/audio';
import {
  barBeats,
  type Rhythm,
  type SongDoc,
  type TabBeatTime,
  type TabBlock,
  type TimelineEvent,
  tabBeats,
  timeline,
} from '@chordtune/chord-sheet';

export const DEFAULT_BPM = 90;
export const DEFAULT_PREVIEW_CHORD = 'Am';

/** `speed` plays everything that many times faster; tempo and bars stay as written. */
export type PlaybackOptions = { bpm: number; capo?: number | null; speed?: number };

export type SongPlayback = {
  events: TimelineEvent[];
  /** Start and end of each event, at the chosen speed. */
  seconds: { start: number; end: number }[];
  /** Start of every beat of a tab event (in `tabBeats` order); `null` for chords. */
  beatStarts: (number[] | null)[];
  notes: ScheduledNote[];
};

export type ActiveBeat = { bar: number; beat: number };
export type PlayingAt = { section: number; line: number; item: number | null; beat: ActiveBeat | null };

function atSpeed(notes: ScheduledNote[], speed: number): ScheduledNote[] {
  return speed === 1 ? notes : notes.map((note) => ({ ...note, time: note.time / speed }));
}

function schedule(
  events: TimelineEvent[],
  rhythms: Rhythm[],
  { bpm, capo, speed = 1 }: PlaybackOptions,
): SongPlayback {
  const seconds = eventSeconds(events, rhythms, bpm).map(({ start, end }) => ({
    start: start / speed,
    end: end / speed,
  }));
  const beatStarts = events.map((event, index) => {
    if (event.kind !== 'tab') {
      return null;
    }
    const quarterSec = 60 / (event.tempo ?? bpm) / speed;
    const start = seconds[index]?.start ?? 0;
    return tabBeats(event.block).map((beat) => start + beat.start * quarterSec);
  });
  const notes = atSpeed(scheduleNotes(events, rhythms, { bpm, capo: capo ?? 0 }), speed);
  return { events, seconds, beatStarts, notes };
}

/** One bar of a pattern on one chord, to loop in the pattern editor. */
export function patternPlayback(rhythm: Rhythm, chord: string, options: PlaybackOptions) {
  const event: TimelineEvent = {
    kind: 'chord',
    chord,
    rhythm: rhythm.key,
    tempo: null,
    bar: 0,
    start: 0,
    length: 1,
    section: 0,
    line: 0,
    item: 0,
  };
  return {
    notes: schedule([event], [rhythm], options).notes,
    loopSec: (barBeats(rhythm.time) * 60) / options.bpm / (options.speed ?? 1),
  };
}

/** The whole song in time, for «Послушать». */
export function songPlayback(doc: SongDoc, rhythms: Rhythm[], options: PlaybackOptions) {
  return schedule(timeline(doc, rhythms), rhythms, options);
}

/** One section in time, for its play button. */
export function sectionPlayback(
  doc: SongDoc,
  rhythms: Rhythm[],
  section: number,
  options: PlaybackOptions,
) {
  return schedule(
    timeline(doc, rhythms).filter((event) => event.section === section),
    rhythms,
    options,
  );
}

/** One tab block on its own; `options.bpm` is the tempo around it, `\tempo` wins. */
export function tabPlayback(block: TabBlock, { bpm, capo, speed = 1 }: PlaybackOptions) {
  const tempo = block.tempo ?? bpm;
  const beats = tabBeats(block);
  return {
    notes: atSpeed(scheduleTab(block, { bpm: tempo, capo: capo ?? 0 }), speed),
    beats,
    beatStarts: beats.map((beat) => (beat.start * 60) / tempo / speed),
  };
}

export function beatAt(
  playback: { beats: TabBeatTime[]; beatStarts: number[] },
  position: number,
): ActiveBeat | null {
  const beat = playback.beats[playback.beatStarts.findLastIndex((start) => start <= position)];
  return beat ? { bar: beat.bar, beat: beat.beat } : null;
}

/** What sounds at `position` seconds: a chord item or a tab beat. */
export function playingAt(playback: SongPlayback, position: number): PlayingAt | null {
  const index = playback.seconds.findIndex(
    (span) => position >= span.start && position < span.end,
  );
  const event = playback.events[index];
  if (!event) {
    return null;
  }
  if (event.kind === 'chord') {
    return { section: event.section, line: event.line, item: event.item, beat: null };
  }
  const starts = playback.beatStarts[index] ?? [];
  const beat = tabBeats(event.block)[Math.max(0, starts.findLastIndex((start) => start <= position))];
  return {
    section: event.section,
    line: event.line,
    item: null,
    beat: beat ? { bar: beat.bar, beat: beat.beat } : null,
  };
}
```

- [ ] **Step 4: Update call sites so the app compiles**

`rhythm-editor-sheet.tsx`: the three `patternPlayback(draft, chord, bpm)` calls become `patternPlayback(draft, chord, { bpm })`.

`song-view.tsx` (temporary, replaced in Task 7): `songPlayback(doc, rhythms, bpm)` → `songPlayback(doc, rhythms, { bpm })`, `sectionPlayback(doc, rhythms, x, bpm)` → `sectionPlayback(doc, rhythms, x, { bpm })`, `patternPlayback(rhythm, firstChord(doc), bpm)` → `patternPlayback(rhythm, firstChord(doc), { bpm })`; in the `active` computation replace the body with `active = playing ? playingAt(playing, player.position) : null;` typed `PlayingAt | null` (import `playingAt`, `type PlayingAt`), and delete the local `Active` type.

`chord-editor.tsx` (temporary, replaced in Task 9): `sectionPlayback(doc, rhythms, x, bpm)` → `sectionPlayback(doc, rhythms, x, { bpm })`; the `active` computation becomes `active = playingAt(sectionPlayback(doc, rhythms, playingSection, { bpm }), player.position);`. In `visual-editor.tsx` change `export type ActiveChord = { section: number; line: number; item: number } | null;` to `export type ActiveChord = PlayingAt | null;` (import `type PlayingAt` from `@/features/rhythm/playback`).

- [ ] **Step 5: Update `zen-timing.ts`**

```ts
import { eventSeconds } from '@chordtune/audio';
import { type Rhythm, type SongDoc, tabBeats, timeline } from '@chordtune/chord-sheet';
```

Update the `ZenLine` doc comments:

```ts
  /** When each chord (or tab beat) of the line starts, and its item index (or beat index). */
  chordStarts: number[];
  chordItems: number[];
```

and inside `events.forEach` replace the two final pushes:

```ts
    line.end = Math.max(line.end, span.end);
    if (event.kind === 'tab') {
      const quarterSec = 60 / (event.tempo ?? bpm);
      tabBeats(event.block).forEach((beat, index) => {
        line.chordStarts.push(span.start + beat.start * quarterSec);
        line.chordItems.push(index);
      });
    } else {
      line.chordStarts.push(span.start);
      line.chordItems.push(event.item);
    }
```

Update the `zenLines` doc comment: "…Lines without chords take no time; an alphaTex block is one line whose «chords» are its beats."

- [ ] **Step 6: Run tests, types, lint**

Run: `cd apps/web && bun test src`
Expected: PASS.
Run: `bunx turbo run check-types` and `bun run lint`
Expected: no errors. If `apps/web` reports `alphatex` lines reaching `LineView` in `song-view.tsx`, `zen-mode.tsx` or `visual-editor.tsx`, guard with `line.type === 'line'` there now (render `null` for `alphatex`); Tasks 7–9 replace those spots.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/rhythm apps/web/src/features/zen/zen-timing.ts apps/web/src/features/zen/zen-timing.test.ts apps/web/src/features/song/song-view.tsx apps/web/src/features/editor apps/web/src/features/zen/zen-mode.tsx
git commit -m "Add playback speed, capo and tab beats to web playback

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Tab layout and the `TabStaff` component

**Files:**
- Create: `apps/web/src/features/tab/tab-layout.ts`
- Create: `apps/web/src/features/tab/tab-layout.test.ts`
- Create: `apps/web/src/features/tab/tab-staff.tsx`

**Interfaces:**
- Consumes: `TabBlock`, `TabBeat` (Task 1); `ActiveBeat` (Task 5).
- Produces:
  - `type BeatLayout = { bar: number; beat: number; x: number; width: number; at: number }` (`at` = quarters from the bar start)
  - `type RowLayout = { bars: { index: number; x: number; width: number }[]; beats: BeatLayout[]; width: number }`
  - `layoutTab(block: TabBlock, width: number): RowLayout[]`
  - `beamGroups(block: TabBlock, row: RowLayout): BeatLayout[][]`
  - `<TabStaff block={TabBlock} activeBeat?={ActiveBeat | null} className?={string} />` — every row is a `<div>`; the row with the active beat has `data-active-row`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/tab/tab-layout.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parseAlphaTex } from '@chordtune/chord-sheet';

import { beamGroups, layoutTab } from './tab-layout';

const block = (source: string) => parseAlphaTex(source.split('\n')).block;

describe('layoutTab', () => {
  test('beat width follows the duration, with a minimum', () => {
    // Half: 72; sixteenths: 9 → 18 each; bar: 10 + 72 + 8 × 18 + 10.
    const [row] = layoutTab(block('0.6.2 :16 0.6 0.6 0.6 0.6 0.6 0.6 0.6 0.6'), 1000);
    expect(row?.width).toBe(236);
    expect(row?.beats.slice(0, 2).map((b) => [b.x, b.width, b.at])).toEqual([
      [46, 72, 0],
      [91, 18, 2],
    ]);
  });

  test('bars wrap into rows of the given width', () => {
    // A whole note bar is 10 + 144 + 10 = 164.
    const rows = layoutTab(block('0.6.1 | 0.6.1 | 0.6.1'), 350);
    expect(rows.map((r) => r.bars.map((b) => [b.index, b.x]))).toEqual([
      [
        [0, 0],
        [1, 164],
      ],
      [[2, 0]],
    ]);
  });

  test('a bar wider than the row gets a row of its own', () => {
    expect(layoutTab(block('0.6.1 | 0.6.1'), 100)).toHaveLength(2);
  });

  test('empty block has no rows', () => {
    expect(layoutTab(block(''), 300)).toEqual([]);
  });
});

describe('beamGroups', () => {
  test('eighths and shorter share a beam within a quarter', () => {
    const tab = block(':8 0.6 0.6 0.6 r 0.6.4 :16 0.6 0.6 0.6 0.6');
    const [row] = layoutTab(tab, 1000);
    if (!row) {
      throw new Error('expected a row');
    }
    expect(beamGroups(tab, row).map((group) => group.map((b) => b.beat))).toEqual([
      [0, 1],
      [5, 6, 7, 8],
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/web && bun test src/features/tab/tab-layout.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `tab-layout.ts`**

```ts
import type { TabBlock } from '@chordtune/chord-sheet';

export const QUARTER_WIDTH = 36;
export const MIN_BEAT_WIDTH = 18;
export const BAR_PAD = 10;
const EPSILON = 1e-6;

export type BeatLayout = {
  bar: number;
  beat: number;
  /** Centre of the beat column. */
  x: number;
  width: number;
  /** Quarter notes from the start of the bar. */
  at: number;
};

export type RowLayout = {
  bars: { index: number; x: number; width: number }[];
  beats: BeatLayout[];
  width: number;
};

/**
 * Beat columns grow with the duration (a quarter is `QUARTER_WIDTH`) but never get narrower
 * than a fret number; bars wrap into rows no wider than `width` (a longer bar gets its own row).
 */
export function layoutTab(block: TabBlock, width: number): RowLayout[] {
  const rows: RowLayout[] = [];
  let row: RowLayout | null = null;

  block.bars.forEach((bar, index) => {
    const widths = bar.beats.map((beat) => Math.max(MIN_BEAT_WIDTH, beat.quarters * QUARTER_WIDTH));
    const barWidth = BAR_PAD * 2 + widths.reduce((sum, w) => sum + w, 0);
    if (!row || (row.width + barWidth > width && row.bars.length > 0)) {
      row = { bars: [], beats: [], width: 0 };
      rows.push(row);
    }
    const x = row.width;
    let cursor = x + BAR_PAD;
    let at = 0;
    bar.beats.forEach((beat, beatIndex) => {
      const beatWidth = widths[beatIndex] ?? MIN_BEAT_WIDTH;
      row?.beats.push({ bar: index, beat: beatIndex, x: cursor + beatWidth / 2, width: beatWidth, at });
      cursor += beatWidth;
      at += beat.quarters;
    });
    row.bars.push({ index, x, width: barWidth });
    row.width += barWidth;
  });
  return rows;
}

/** Runs of two or more 8th-or-shorter notes in the same quarter of a bar share a beam. */
export function beamGroups(block: TabBlock, row: RowLayout): BeatLayout[][] {
  const groups: BeatLayout[][] = [];
  let group: BeatLayout[] = [];
  let key = '';
  const flush = () => {
    if (group.length > 1) {
      groups.push(group);
    }
    group = [];
    key = '';
  };
  for (const layout of row.beats) {
    const beat = block.bars[layout.bar]?.beats[layout.beat];
    if (!beat || beat.notes.length === 0 || beat.duration < 8) {
      flush();
      continue;
    }
    const nextKey = `${layout.bar}:${Math.floor(layout.at + EPSILON)}`;
    if (nextKey !== key) {
      flush();
      key = nextKey;
    }
    group.push(layout);
  }
  flush();
  return groups;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/web && bun test src/features/tab/tab-layout.test.ts`
Expected: PASS.

- [ ] **Step 5: Write `tab-staff.tsx`**

```tsx
'use client';

import type { TabBar, TabBeat, TabBlock, TabNote } from '@chordtune/chord-sheet';
import { useLayoutEffect, useRef, useState } from 'react';

import type { ActiveBeat } from '@/features/rhythm/playback';
import { cn } from '@/lib/utils';
import { type BeatLayout, beamGroups, layoutTab, type RowLayout } from './tab-layout';

const STRING_GAP = 10;
const TEXT_Y = 9;
const MARK_Y = 21;
const TOP = 32;
const STAFF = STRING_GAP * 5;
const RHYTHM_TOP = TOP + STAFF + 8;
const STEM = 16;
const LYRICS_Y = RHYTHM_TOP + STEM + 16;
const DEFAULT_WIDTH = 320;

const stringY = (string: number) => TOP + (string - 1) * STRING_GAP;
const beamCount = (duration: number) => Math.max(0, Math.log2(duration / 4));

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    setWidth(element.clientWidth || DEFAULT_WIDTH);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width || DEFAULT_WIDTH);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A tab block as tablature: six strings, rhythm under them, text above, lyrics below. */
export function TabStaff({
  block,
  activeBeat = null,
  className,
}: {
  block: TabBlock;
  activeBeat?: ActiveBeat | null;
  className?: string;
}) {
  const [ref, width] = useWidth();
  const rows = layoutTab(block, width);
  const hasLyrics = block.bars.some((bar) => bar.beats.some((beat) => beat.syllable));
  const height = hasLyrics ? LYRICS_Y + 6 : RHYTHM_TOP + STEM + 6;

  return (
    <div ref={ref} className={cn('flex flex-col gap-3 overflow-x-auto', className)}>
      {rows.map((row) => {
        const first = row.bars[0]?.index ?? 0;
        const active =
          activeBeat !== null &&
          row.beats.some((b) => b.bar === activeBeat.bar && b.beat === activeBeat.beat);
        return (
          <div key={first} data-active-row={active || undefined}>
            <svg
              width={row.width}
              height={height}
              className="block overflow-visible"
              aria-hidden
            >
              <Row block={block} row={row} activeBeat={activeBeat} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function Row({
  block,
  row,
  activeBeat,
}: {
  block: TabBlock;
  row: RowLayout;
  activeBeat: ActiveBeat | null;
}) {
  const beatOf = (layout: BeatLayout) => block.bars[layout.bar]?.beats[layout.beat];
  const beamed = new Set(beamGroups(block, row).flat());

  return (
    <g>
      {[1, 2, 3, 4, 5, 6].map((string) => (
        <line
          key={string}
          x1={0}
          x2={row.width}
          y1={stringY(string)}
          y2={stringY(string)}
          className="stroke-border"
        />
      ))}
      {row.bars.map((bar) => (
        <BarLines key={bar.index} bar={block.bars[bar.index]} x={bar.x} width={bar.width} />
      ))}
      <line x1={row.width} x2={row.width} y1={TOP} y2={TOP + STAFF} className="stroke-muted-foreground" />
      <Runs row={row} beatOf={beatOf} />
      {row.beats.map((layout, index) => {
        const beat = beatOf(layout);
        if (!beat) {
          return null;
        }
        const following = row.beats.slice(index + 1);
        return (
          <Beat
            key={`${layout.bar}:${layout.beat}`}
            beat={beat}
            layout={layout}
            active={activeBeat?.bar === layout.bar && activeBeat.beat === layout.beat}
            beamed={beamed.has(layout)}
            target={(note) => {
              for (const next of following) {
                const found = beatOf(next)?.notes.find((other) => other.string === note.string);
                if (found) {
                  return { layout: next, note: found };
                }
              }
              return null;
            }}
          />
        );
      })}
      {beamGroups(block, row).map((group) => (
        <Beams key={`${group[0]?.bar}:${group[0]?.beat}`} group={group} beatOf={beatOf} />
      ))}
    </g>
  );
}

function BarLines({ bar, x, width }: { bar: TabBar | undefined; x: number; width: number }) {
  const dots = (dx: number) =>
    [2.5, 4.5].map((string) => (
      <circle key={string} cx={dx} cy={stringY(string)} r={1.8} className="fill-muted-foreground" />
    ));
  return (
    <g className="stroke-muted-foreground">
      <line x1={x} x2={x} y1={TOP} y2={TOP + STAFF} />
      {bar?.repeatOpen && (
        <g>
          <rect x={x + 1} y={TOP} width={2.5} height={STAFF} className="fill-muted-foreground" />
          {dots(x + 8)}
        </g>
      )}
      {bar?.repeatClose !== null && bar?.repeatClose !== undefined && (
        <g>
          {dots(x + width - 8)}
          <rect x={x + width - 3.5} y={TOP} width={2.5} height={STAFF} className="fill-muted-foreground" />
          <text
            x={x + width - 2}
            y={MARK_Y}
            textAnchor="end"
            className="fill-muted-foreground stroke-none text-[10px]"
          >
            ×{bar.repeatClose}
          </text>
        </g>
      )}
    </g>
  );
}

/** «P.M.» and «let ring» over runs of beats, with a dashed line to the end of the run. */
function Runs({
  row,
  beatOf,
}: {
  row: RowLayout;
  beatOf: (layout: BeatLayout) => TabBeat | undefined;
}) {
  const runs = (flag: 'palmMute' | 'letRing') => {
    const result: BeatLayout[][] = [];
    for (const layout of row.beats) {
      if (!beatOf(layout)?.[flag]) {
        continue;
      }
      const last = result.at(-1);
      const previous = last?.at(-1);
      if (last && previous && row.beats.indexOf(previous) === row.beats.indexOf(layout) - 1) {
        last.push(layout);
      } else {
        result.push([layout]);
      }
    }
    return result;
  };
  const draw = (label: string, run: BeatLayout[]) => {
    const first = run[0];
    const last = run.at(-1);
    if (!first || !last) {
      return null;
    }
    return (
      <g key={`${label}:${first.bar}:${first.beat}`}>
        <text x={first.x - 6} y={MARK_Y} className="fill-muted-foreground text-[9px]">
          {label}
        </text>
        {last !== first && (
          <line
            x1={first.x + 18}
            x2={last.x + 4}
            y1={MARK_Y - 3}
            y2={MARK_Y - 3}
            strokeDasharray="3 3"
            className="stroke-muted-foreground"
          />
        )}
      </g>
    );
  };
  return (
    <g>
      {runs('palmMute').map((run) => draw('P.M.', run))}
      {runs('letRing').map((run) => draw('let ring', run))}
    </g>
  );
}

function Beat({
  beat,
  layout,
  active,
  beamed,
  target,
}: {
  beat: TabBeat;
  layout: BeatLayout;
  active: boolean;
  beamed: boolean;
  target: (note: TabNote) => { layout: BeatLayout; note: TabNote } | null;
}) {
  const { x } = layout;
  return (
    <g>
      {active && (
        <rect
          x={x - layout.width / 2}
          y={TOP - 7}
          width={layout.width}
          height={STAFF + 14}
          rx={4}
          className="fill-primary/20"
        />
      )}
      {beat.text && (
        <text x={x} y={TEXT_Y} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {beat.text}
        </text>
      )}
      {beat.notes.map((note) => (
        <NoteMark key={note.string} note={note} x={x} active={active} target={target(note)} />
      ))}
      <Rhythm beat={beat} x={x} beamed={beamed} />
      {beat.syllable && (
        <text x={x} y={LYRICS_Y} textAnchor="middle" className="fill-foreground text-[12px]">
          {beat.syllable}
        </text>
      )}
    </g>
  );
}

function NoteMark({
  note,
  x,
  active,
  target,
}: {
  note: TabNote;
  x: number;
  active: boolean;
  target: { layout: BeatLayout; note: TabNote } | null;
}) {
  const y = stringY(note.string);
  const label = note.fret === 'x' ? 'x' : note.tie ? `(${note.fret})` : String(note.fret);
  const up =
    target && typeof target.note.fret === 'number' && typeof note.fret === 'number'
      ? target.note.fret > note.fret
      : true;
  const bend = note.effects.bend ? Math.max(...note.effects.bend) : 0;
  return (
    <g>
      {note.effects.hammer && target && (
        <g className="fill-none stroke-muted-foreground">
          <path d={`M ${x + 4} ${y - 6} Q ${(x + target.layout.x) / 2} ${y - 14} ${target.layout.x - 4} ${y - 6}`} />
          <text
            x={(x + target.layout.x) / 2}
            y={y - 12}
            textAnchor="middle"
            className="fill-muted-foreground stroke-none text-[9px]"
          >
            {up ? 'h' : 'p'}
          </text>
        </g>
      )}
      {note.effects.slide && target && (
        <line
          x1={x + 7}
          x2={target.layout.x - 7}
          y1={y + (up ? 3 : -3)}
          y2={y + (up ? -3 : 3)}
          className="stroke-muted-foreground"
        />
      )}
      {bend > 0 && (
        <g className="fill-none stroke-muted-foreground">
          <path d={`M ${x + 7} ${y} Q ${x + 14} ${y} ${x + 14} ${TOP - 4}`} />
          <path d={`M ${x + 11} ${TOP - 1} L ${x + 14} ${TOP - 6} L ${x + 17} ${TOP - 1}`} />
          <text x={x + 14} y={TOP - 8} textAnchor="middle" className="fill-muted-foreground stroke-none text-[9px]">
            {bend === 2 ? '½' : bend === 4 ? 'full' : String(bend / 4)}
          </text>
        </g>
      )}
      {note.effects.vibrato && (
        <path
          d={`M ${x - 6} ${y - 9} q 2 -3 4 0 t 4 0 t 4 0`}
          className="fill-none stroke-muted-foreground"
        />
      )}
      <text
        x={x}
        y={y}
        dy="0.35em"
        textAnchor="middle"
        paintOrder="stroke"
        className={cn(
          'stroke-[4px] stroke-background font-mono text-[11px]',
          active ? 'fill-primary' : 'fill-foreground',
        )}
      >
        {label}
      </text>
    </g>
  );
}

function Rhythm({ beat, x, beamed }: { beat: TabBeat; x: number; beamed: boolean }) {
  const bottom = RHYTHM_TOP + STEM;
  if (beat.notes.length === 0) {
    return (
      <path
        d={`M ${x - 2} ${RHYTHM_TOP + 2} l 4 4 l -4 4 l 4 4`}
        className="fill-none stroke-muted-foreground"
      />
    );
  }
  if (beat.duration === 1) {
    return null;
  }
  const top = beat.duration === 2 ? RHYTHM_TOP + STEM / 2 : RHYTHM_TOP;
  const flags = beamed ? 0 : beamCount(beat.duration);
  return (
    <g className="stroke-muted-foreground">
      <line x1={x} x2={x} y1={top} y2={bottom} />
      {Array.from({ length: flags }, (_, i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: flags are positional
          key={i}
          x1={x}
          x2={x + 5}
          y1={bottom - i * 4}
          y2={bottom - i * 4 - 5}
        />
      ))}
      {beat.dotted && <circle cx={x + 4} cy={bottom - 2} r={1.5} className="fill-muted-foreground" />}
      {beat.tuplet && !beamed && (
        <text x={x} y={bottom + 10} textAnchor="middle" className="fill-muted-foreground stroke-none text-[9px]">
          {beat.tuplet}
        </text>
      )}
    </g>
  );
}

function Beams({
  group,
  beatOf,
}: {
  group: BeatLayout[];
  beatOf: (layout: BeatLayout) => TabBeat | undefined;
}) {
  const first = group[0];
  const last = group.at(-1);
  if (!first || !last) {
    return null;
  }
  const beats = group.map(beatOf);
  const count = Math.min(...beats.map((beat) => beamCount(beat?.duration ?? 8)));
  const bottom = RHYTHM_TOP + STEM;
  const tuplet = beats[0]?.tuplet;
  return (
    <g className="stroke-muted-foreground">
      {Array.from({ length: count }, (_, i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: beams are positional
          key={i}
          x1={first.x}
          x2={last.x}
          y1={bottom - i * 4}
          y2={bottom - i * 4}
          strokeWidth={2}
        />
      ))}
      {tuplet && beats.every((beat) => beat?.tuplet === tuplet) && (
        <text
          x={(first.x + last.x) / 2}
          y={bottom + 10}
          textAnchor="middle"
          className="fill-muted-foreground stroke-none text-[9px]"
        >
          {tuplet}
        </text>
      )}
    </g>
  );
}
```

- [ ] **Step 6: Types and lint**

Run: `bunx turbo run check-types --filter=@chordtune/web` and `bun run lint`
Expected: no errors (fix Biome formatting with `bun run format` if it only reports formatting).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/features/tab
git commit -m "Add tab layout and TabStaff tablature component

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Song page: tabs, active beat and speed in the dock

**Files:**
- Create: `apps/web/src/features/song/speed-chips.tsx`
- Modify: `apps/web/src/features/song/song-view.tsx`
- Modify: `apps/web/src/features/song/song-dock.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json` (`song.speed`)

**Interfaces:**
- Consumes: `songPlayback`, `sectionPlayback`, `patternPlayback`, `playingAt`, `PlayingAt` (Task 5); `TabStaff` (Task 6); `timeline` (Task 3).
- Produces:
  - `SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const`, `formatSpeed(speed: number): string` (`'0.75×'`), `<SpeedChips speed onChange className? />` (`speed-chips.tsx`).
  - `SongDock` props gain `speed: number; onSpeedChange: (speed: number) => void`.
  - `ZenMode` is called with `bpm`, `speed`, `onSpeedChange` (implemented in Task 8; in this task pass the props already — Task 8 changes the component signature, so do Tasks 7 and 8 back to back and run type checks after Task 8).

- [ ] **Step 1: Add the copy**

`ru.json` → `"song"`: `"speed": "Скорость"`; `en.json` → `"song"`: `"speed": "Speed"`.

- [ ] **Step 2: Write `speed-chips.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export function formatSpeed(speed: number): string {
  return `${speed}×`;
}

/** Playback speed of the whole song: tempo and bars stay, time runs faster or slower. */
export function SpeedChips({
  speed,
  onChange,
  className,
}: {
  speed: number;
  onChange: (speed: number) => void;
  className?: string;
}) {
  const t = useTranslations('song');
  return (
    <div role="radiogroup" aria-label={t('speed')} className={cn('flex gap-1', className)}>
      {SPEEDS.map((value) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={value === speed}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-full px-2 py-0.5 font-semibold text-xs tabular-nums transition-colors',
            value === speed
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-2 text-muted-foreground',
          )}
        >
          {formatSpeed(value)}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add speed to `SongDock`**

Import `import { SpeedChips } from './speed-chips';`. New props `speed: number; onSpeedChange: (speed: number) => void;`. Wrap the two pills: the outer `motion.div` keeps its `fixed … mx-auto max-w-md` classes but changes `flex gap-2` to `flex flex-col items-center gap-2`; inside it put

```tsx
      <SpeedChips
        speed={speed}
        onChange={onSpeedChange}
        className="rounded-full border border-border bg-popover/90 p-1 shadow-lg backdrop-blur-xl"
      />
      <div className="flex w-full gap-2">
        {/* the two existing motion.button pills, unchanged */}
      </div>
```

Update the `listenHint` doc comment: `/** «Бой A · 90 BPM · 0.75×», or the current section while playing. */`.

- [ ] **Step 4: Update `song-view.tsx`**

Imports: add `timeline` from `@chordtune/chord-sheet`; `type PlayingAt`, `playingAt` from `@/features/rhythm/playback`; `TabStaff` from `@/features/tab/tab-staff`; `formatSpeed` from `./speed-chips`. Remove the `chordList` import if unused.

State and playback:

```tsx
  const bpm = arrangement.tempo ?? DEFAULT_BPM;
  const [speed, setSpeed] = useState(1);
  const options = { bpm, capo: arrangement.capo, speed };
  const player = useStrumPlayer();
  const { rhythms } = arrangement;

  const [zenOpen, setZenOpen] = useState(false);

  const playing = useMemo(() => {
    const opts = { bpm, capo: arrangement.capo, speed };
    if (player.playing === 'song') {
      return songPlayback(doc, rhythms, opts);
    }
    const match = player.playing?.match(/^section:(\d+)$/);
    return match ? sectionPlayback(doc, rhythms, Number(match[1]), opts) : null;
  }, [player.playing, doc, rhythms, bpm, arrangement.capo, speed]);

  const active: PlayingAt | null = playing ? playingAt(playing, player.position) : null;

  const changeSpeed = (next: number) => {
    // Scheduled notes are fixed at their speed: stop instead of drifting.
    player.stop();
    setSpeed(next);
  };
```

Hints and `canPlay`:

```tsx
  const speedHint = speed === 1 ? '' : ` · ${formatSpeed(speed)}`;
  const listenHint =
    player.playing === 'song' && active
      ? (doc.sections[active.section]?.label ?? rhythmHint)
      : `${rhythmHint} · ${bpm} BPM${speedHint}`;
  const canPlay = useMemo(() => timeline(doc, rhythms).length > 0, [doc, rhythms]);
```

All playback calls use `options`: `sectionPlayback(doc, rhythms, section, options)`, `patternPlayback(rhythm, firstChord(doc), options)`, `songPlayback(doc, rhythms, options).notes`.

Section header: after the `RhythmBadge`, show the section tempo when set:

```tsx
                {section.tempo && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {t('bpm', { bpm: section.tempo })}
                  </span>
                )}
```

Lines — replace the `line.type === 'tab' ? … : …` expression with:

```tsx
            {section.lines.map((line, lineIndex) => {
              const here = active?.section === sectionIndex && active.line === lineIndex;
              if (line.type === 'tab') {
                // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                return <TabView key={lineIndex} lines={line.lines} />;
              }
              if (line.type === 'alphatex') {
                return (
                  <TabStaff
                    // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                    key={lineIndex}
                    block={line.block}
                    activeBeat={here ? active.beat : null}
                    className="py-1"
                  />
                );
              }
              return (
                <LineView
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  key={lineIndex}
                  items={line.items}
                  activeItem={here ? active.item : null}
                />
              );
            })}
```

Dock and zen:

```tsx
      <SongDock
        raised={preview}
        listening={player.playing === 'song'}
        listenHint={listenHint}
        onListen={() => player.toggle('song', songPlayback(doc, rhythms, options).notes)}
        speed={speed}
        onSpeedChange={changeSpeed}
        canPlay={canPlay}
        onPlay={() => {
          player.stop();
          setZenOpen(true);
        }}
      />
      <AnimatePresence>
        {zenOpen && (
          <ZenMode
            doc={doc}
            rhythms={rhythms}
            bpm={bpm}
            speed={speed}
            onSpeedChange={setSpeed}
            title={arrangement.song.title}
            artist={arrangement.artist.name}
            played={actions.me.played}
            onFinished={() => void actions.addPlayed(1)}
            onClose={() => setZenOpen(false)}
          />
        )}
      </AnimatePresence>
```

- [ ] **Step 5: Continue with Task 8 before checking types** (the `ZenMode` props change there).

---

### Task 8: Zen mode: speed instead of BPM, tabs in the scroll

**Files:**
- Modify: `apps/web/src/features/zen/zen-clock.ts`
- Modify: `apps/web/src/features/zen/zen-clock.test.ts`
- Modify: `apps/web/src/features/zen/zen-mode.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json` (drop `zen.slower`/`zen.faster` if unused)

**Interfaces:**
- Consumes: `zenLines` with tab lines (Task 5); `TabStaff` (Task 6); `SpeedChips` (Task 7); `tabBeats` (Task 1).
- Produces: `advanceClock(seconds: number, frameMs: number, speed?: number): number`; `ZenMode` props `{ doc; rhythms; bpm: number; speed: number; onSpeedChange: (speed: number) => void; title; artist; played; onFinished; onClose }`.

- [ ] **Step 1: Write the failing test**

Append to `zen-clock.test.ts`:

```ts
  test('speed makes song time run faster or slower', () => {
    expect(advanceClock(1, 100, 1.5)).toBeCloseTo(1.15, 9);
    expect(advanceClock(1, 100, 0.5)).toBeCloseTo(1.05, 9);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && bun test src/features/zen/zen-clock.test.ts`
Expected: FAIL — `1.1` received for speed 1.5.

- [ ] **Step 3: Implement `advanceClock`**

```ts
/** Longest step the clock takes per frame, so time spent in the background is not skipped. */
const MAX_FRAME_MS = 250;

/** Song time after a frame; `speed` is the playback speed (1.5 plays half again as fast). */
export function advanceClock(seconds: number, frameMs: number, speed = 1): number {
  return seconds + (Math.min(frameMs, MAX_FRAME_MS) / 1000) * speed;
}
```

Run: `cd apps/web && bun test src/features/zen/zen-clock.test.ts` → PASS.

- [ ] **Step 4: Update `zen-mode.tsx`**

Imports: drop `Minus`, `Plus`; add `tabBeats` from `@chordtune/chord-sheet`; `TabStaff` from `@/features/tab/tab-staff`; `SpeedChips` from `@/features/song/speed-chips`. Delete `MIN_BPM`, `MAX_BPM`, `BPM_STEP`, the `bpm` state and `changeBpm`.

Props:

```tsx
export function ZenMode({
  doc,
  rhythms,
  bpm,
  speed,
  onSpeedChange,
  title,
  artist,
  played,
  onFinished,
  onClose,
}: {
  doc: SongDoc;
  rhythms: Rhythm[];
  /** The song tempo; section and block tempos come from the document. */
  bpm: number;
  /** Playback speed: time is song time, so changing it keeps the place in the song. */
  speed: number;
  onSpeedChange: (speed: number) => void;
  …
```

`time` is song time at 1×. The clock:

```tsx
    const tick = (now: number) => {
      timeRef.current = advanceClock(timeRef.current, now - last, speedRef.current);
```

with `const speedRef = useRef(speed); speedRef.current = speed;` next to `timeRef`, so a speed change applies from the next frame without restarting the effect.

The footer clock shows wall time: `{clock(time / speed)} / {clock(total / speed)}`.

The footer right side replaces the ±BPM group with:

```tsx
        <SpeedChips speed={speed} onChange={onSpeedChange} className="ml-auto" />
```

Rows — replace the `{line.type === 'tab' ? … : <LineView … />}` expression:

```tsx
                    {line.type === 'tab' ? (
                      <TabView lines={line.lines} />
                    ) : line.type === 'alphatex' ? (
                      <TabStaff
                        block={line.block}
                        activeBeat={
                          isCurrent
                            ? (() => {
                                const beat =
                                  tabBeats(line.block)[current?.chordItems[position.chord] ?? -1];
                                return beat ? { bar: beat.bar, beat: beat.beat } : null;
                              })()
                            : null
                        }
                      />
                    ) : (
                      <LineView
                        items={line.items}
                        activeItem={
                          isCurrent ? (current?.chordItems[position.chord] ?? null) : null
                        }
                      />
                    )}
```

Tab rows are not scaled up: in the row `className`, use `isCurrent && line.type !== 'alphatex' ? 'scale-[1.04] opacity-100' : isCurrent ? 'opacity-100' : …` (keep the other branches as they are).

Scroll — in the `useLayoutEffect`, the current line's top follows the active tab row:

```tsx
  useLayoutEffect(() => {
    const height = viewport.current?.clientHeight ?? 0;
    const top = (key?: string) => {
      const element = key ? rows.current.get(key) : undefined;
      if (!element) {
        return 0;
      }
      // Inside a tab block, follow the row with the current beat.
      const row = element.querySelector<HTMLElement>('[data-active-row]');
      return row ? row.offsetTop : element.offsetTop;
    };
    const from = top(current ? `${current.section}:${current.line}` : undefined);
    const to = next ? top(`${next.section}:${next.line}`) : from;
    setOffset(height * ANCHOR - (from + (to - from) * zenOffset(position.progress)));
  }, [current, next, position.progress]);
```

(`row.offsetTop` is relative to the same absolutely positioned scroller as the line elements, because nothing between them is positioned.)

- [ ] **Step 5: Copy**

Remove `slower`/`faster` from `zen` in both message files if nothing else uses them (`grep -rn "t('slower')\|t('faster')" apps/web/src` returns nothing).

- [ ] **Step 6: Run tests, types, lint**

Run: `cd apps/web && bun test src` → PASS.
Run: `bunx turbo run check-types` and `bun run lint` → no errors.

- [ ] **Step 7: Commit Tasks 7 and 8 together**

```bash
git add apps/web/src/features/song apps/web/src/features/zen apps/web/messages
git commit -m "Show tabs on the song page and in zen, add playback speed

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Editor: section tempo, tab blocks and the tab editor sheet

**Files:**
- Create: `apps/web/src/features/tab/tab-source.ts`
- Create: `apps/web/src/features/tab/tab-source.test.ts`
- Create: `apps/web/src/features/tab/tab-editor-sheet.tsx`
- Modify: `apps/web/src/features/editor/doc-edit.ts` (`setLine`)
- Modify: `apps/web/src/features/editor/visual-editor.tsx`
- Modify: `apps/web/src/features/editor/chord-editor.tsx`
- Modify: `apps/web/src/features/editor/song-form.tsx` (pass `capo`)
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `alphatexLine`, `parseAlphaTex`, `isTempo`, `MIN_TEMPO`, `MAX_TEMPO` (Tasks 1–2); `tabPlayback`, `beatAt`, `sectionPlayback`, `playingAt`, `PlayingAt` (Task 5); `TabStaff` (Task 6).
- Produces:
  - `type BlockMeta = 'tempo' | 'ts'`; `readBlockMeta(source: readonly string[], command: BlockMeta): string | null`; `setBlockMeta(source: readonly string[], command: BlockMeta, value: string | null): string[]`.
  - `setLine(doc: SongDoc, section: number, line: number, next: Line): SongDoc` (`doc-edit.ts`).
  - `<TabEditorSheet source={string[] | null} bpm={number} capo={number | null} player={StrumPlayerControls} onSave={(source: string[]) => void} onClose={() => void} />`.
  - `VisualEditor` props gain `songBpm: number`, `capo: number | null`, `player: StrumPlayerControls`, `playingTab: string | null` (`"s:l"`), `onPlayTab: (section: number, line: number) => void`.
  - `ChordEditor` props gain `capo: number | null`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/tab/tab-source.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { readBlockMeta, setBlockMeta } from './tab-source';

describe('setBlockMeta', () => {
  test('adds, replaces and removes a command line', () => {
    expect(setBlockMeta([':8 0.6'], 'tempo', '140')).toEqual(['\\tempo 140', ':8 0.6']);
    expect(setBlockMeta(['\\tempo 140', ':8 0.6'], 'tempo', '90')).toEqual([
      '\\tempo 90',
      ':8 0.6',
    ]);
    expect(setBlockMeta(['\\tempo 140', '\\ts 3 4', '0.6'], 'tempo', null)).toEqual([
      '\\ts 3 4',
      '0.6',
    ]);
    expect(setBlockMeta(['0.6'], 'ts', null)).toEqual(['0.6']);
  });
});

describe('readBlockMeta', () => {
  test('returns the raw value, even a half-typed one', () => {
    expect(readBlockMeta(['\\tempo 140', '\\ts 3 4'], 'ts')).toBe('3 4');
    expect(readBlockMeta(['\\tempo 1', '0.6'], 'tempo')).toBe('1');
    expect(readBlockMeta(['0.6'], 'tempo')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/web && bun test src/features/tab/tab-source.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `tab-source.ts`**

```ts
export type BlockMeta = 'tempo' | 'ts';

const metaRe = (command: BlockMeta) => new RegExp(`^\\s*\\\\${command}\\b\\s*(.*)$`);

/** The argument of `\tempo` / `\ts` in a block, as written. */
export function readBlockMeta(source: readonly string[], command: BlockMeta): string | null {
  const re = metaRe(command);
  for (const line of source) {
    const match = re.exec(line);
    if (match) {
      return (match[1] ?? '').trim();
    }
  }
  return null;
}

/** Sets or replaces the `\tempo` / `\ts` line of a block; `null` removes it. */
export function setBlockMeta(
  source: readonly string[],
  command: BlockMeta,
  value: string | null,
): string[] {
  const re = metaRe(command);
  const index = source.findIndex((line) => re.test(line));
  const line = `\\${command} ${value}`;
  if (index === -1) {
    return value === null ? [...source] : [line, ...source];
  }
  return value === null
    ? source.filter((_, i) => i !== index)
    : source.map((current, i) => (i === index ? line : current));
}
```

Run: `cd apps/web && bun test src/features/tab/tab-source.test.ts` → PASS.

- [ ] **Step 4: Add `setLine` to `doc-edit.ts`**

```ts
export function setLine(doc: SongDoc, section: number, line: number, next: Line): SongDoc {
  return withSection(doc, section, (s) => ({
    ...s,
    lines: s.lines.map((l, i) => (i === line ? next : l)),
  }));
}
```

- [ ] **Step 5: Add the copy**

`ru.json`:

```json
"editor": {
  …,
  "addTab": "Таб",
  "playTab": "Прослушать таб",
  "editTab": "Изменить таб",
  "sectionTempo": "Темп секции"
},
"tab": {
  "title": "Таб",
  "tempo": "Темп",
  "time": "Размер",
  "source": "alphaTex",
  "placeholder": ":8 0.5 5.3 8.2 0.5 | …",
  "play": "Прослушать",
  "cancel": "Отмена",
  "done": "Готово",
  "lineError": "Строка {line}: {message}",
  "cheatsheet": "Шпаргалка",
  "cheat": {
    "note": "лад.струна — 5-й лад на 3-й струне",
    "duration": "длительность для всех следующих (1 2 4 8 16 32)",
    "beatDuration": "длительность только этой ноты",
    "rest": "пауза",
    "chord": "несколько нот разом",
    "dead": "мёртвая нота; -.3 — лига",
    "effects": "точка, триоль, hammer, слайд, палм-мьют",
    "bend": "бенд (в четвертях тона), вибрато",
    "text": "подпись над нотой",
    "lyrics": "слова под нотами, _ пропускает ноту",
    "repeat": "реприза, всего 2 раза",
    "meta": "темп и размер блока"
  }
}
```

`en.json`: the same keys — `"addTab": "Tab"`, `"playTab": "Play tab"`, `"editTab": "Edit tab"`, `"sectionTempo": "Section tempo"`; `tab`: `"title": "Tab"`, `"tempo": "Tempo"`, `"time": "Time"`, `"source": "alphaTex"`, `"placeholder": ":8 0.5 5.3 8.2 0.5 | …"`, `"play": "Play"`, `"cancel": "Cancel"`, `"done": "Done"`, `"lineError": "Line {line}: {message}"`, `"cheatsheet": "Cheat sheet"`, `cheat`: `"note": "fret.string — 5th fret on the 3rd string"`, `"duration": "duration for all that follow (1 2 4 8 16 32)"`, `"beatDuration": "duration of this note only"`, `"rest": "rest"`, `"chord": "several notes at once"`, `"dead": "dead note; -.3 is a tie"`, `"effects": "dot, triplet, hammer, slide, palm mute"`, `"bend": "bend (quarter tones), vibrato"`, `"text": "text above the note"`, `"lyrics": "lyrics under the notes, _ skips one"`, `"repeat": "repeat, twice in total"`, `"meta": "tempo and time of the block"`.

- [ ] **Step 6: Write `tab-editor-sheet.tsx`**

```tsx
'use client';

import { MAX_TEMPO, MIN_TEMPO, parseAlphaTex } from '@chordtune/chord-sheet';
import { Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { beatAt, tabPlayback } from '@/features/rhythm/playback';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { readBlockMeta, setBlockMeta } from './tab-source';
import { TabStaff } from './tab-staff';

const PREVIEW_ID = 'tab-preview';
const TIMES = ['4/4', '3/4', '6/8', '2/4'];
const CHEATS: [code: string, key: string][] = [
  ['5.3', 'note'],
  [':8', 'duration'],
  ['5.3.16', 'beatDuration'],
  ['r  r.2', 'rest'],
  ['(0.5 2.4).4', 'chord'],
  ['x.3  -.3', 'dead'],
  ['{d} {tu 3} {h} {sl} {pm}', 'effects'],
  ['{b (0 4)} {v}', 'bend'],
  ['{txt "тише"}', 'text'],
  ['\\lyrics "сло-ва _ пес-ни"', 'lyrics'],
  ['\\ro … \\rc 2', 'repeat'],
  ['\\tempo 140  \\ts 3 4', 'meta'],
];

/** Writes one alphaTex block: the source, a live tablature, problems, and a play button. */
export function TabEditorSheet({
  source,
  bpm,
  capo,
  player,
  onSave,
  onClose,
}: {
  /** `null` keeps the sheet closed. */
  source: string[] | null;
  /** Tempo around the block (section or song); `\tempo` in the block wins. */
  bpm: number;
  capo: number | null;
  player: StrumPlayerControls;
  onSave: (source: string[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations('tab');
  const [text, setText] = useState(source?.join('\n') ?? '');
  useEffect(() => setText(source?.join('\n') ?? ''), [source]);

  const lines = useMemo(() => text.split('\n'), [text]);
  const { block, diagnostics } = useMemo(() => parseAlphaTex(lines), [lines]);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const playback = useMemo(() => tabPlayback(block, { bpm, capo }), [block, bpm, capo]);
  const previewing = player.playing === PREVIEW_ID;
  const activeBeat = previewing ? beatAt(playback, player.position) : null;
  const time = readBlockMeta(lines, 'ts')?.replace(/\s+/, '/') ?? '4/4';

  const setMeta = (command: 'tempo' | 'ts', value: string | null) =>
    setText(setBlockMeta(lines, command, value).join('\n'));

  const close = () => {
    if (previewing) {
      player.stop();
    }
    onClose();
  };

  const save = () => {
    if (previewing) {
      player.stop();
    }
    const end = lines.findLastIndex((line) => line.trim() !== '');
    onSave(lines.slice(0, end + 1));
  };

  return (
    <Sheet open={source !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-xl"
      >
        {source !== null && (
          <div className="flex flex-col gap-4 p-4 pt-0">
            <SheetHeader className="px-0">
              <SheetTitle>{t('title')}</SheetTitle>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tab-tempo">{t('tempo')}</Label>
                <Input
                  id="tab-tempo"
                  type="number"
                  inputMode="numeric"
                  min={MIN_TEMPO}
                  max={MAX_TEMPO}
                  placeholder={String(bpm)}
                  value={readBlockMeta(lines, 'tempo') ?? ''}
                  onChange={(event) => setMeta('tempo', event.target.value || null)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('time')}</Label>
                <Select
                  value={time}
                  items={TIMES.map((value) => ({ value, label: value }))}
                  onValueChange={(value) =>
                    value && setMeta('ts', value === '4/4' ? null : value.replace('/', ' '))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tab-source">{t('source')}</Label>
              <Textarea
                id="tab-source"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t('placeholder')}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                wrap="off"
                className="min-h-40 overflow-x-auto whitespace-pre font-mono text-sm leading-6"
              />
            </div>

            <TabStaff block={block} activeBeat={activeBeat} className="rounded-md bg-muted/30 p-2" />

            {diagnostics.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {diagnostics.map((diagnostic) => (
                  <li
                    key={`${diagnostic.line}:${diagnostic.col}:${diagnostic.message}`}
                    className={
                      diagnostic.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'
                    }
                  >
                    {t('lineError', { line: diagnostic.line, message: diagnostic.message })}
                  </li>
                ))}
              </ul>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t('cheatsheet')}</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {CHEATS.map(([code, key]) => (
                  <div key={key} className="contents">
                    <dt className="font-mono text-xs">{code}</dt>
                    <dd className="text-muted-foreground text-xs">{t(`cheat.${key}`)}</dd>
                  </div>
                ))}
              </dl>
            </details>

            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={playback.notes.length === 0}
                onClick={() =>
                  previewing ? player.stop() : void player.play(PREVIEW_ID, playback.notes)
                }
              >
                {previewing ? <Square /> : <Play />}
                {t('play')}
              </Button>
              <Button variant="ghost" className="ml-auto" onClick={close}>
                {t('cancel')}
              </Button>
              <Button disabled={errors.length > 0} onClick={save}>
                {t('done')}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 7: Update `visual-editor.tsx`**

Imports: add `alphatexLine`, `isTempo` from `@chordtune/chord-sheet`; `useEffect` from `react`; `StrumPlayerControls` type from `@/features/rhythm/use-strum-player`; `TabEditorSheet` from `@/features/tab/tab-editor-sheet`; `TabStaff` from `@/features/tab/tab-staff`; `setLine` from `./doc-edit`.

Props (add to the destructuring and the type):

```tsx
  songBpm: number;
  capo: number | null;
  player: StrumPlayerControls;
  /** `"section:line"` of the tab block that is playing. */
  playingTab: string | null;
  onPlayTab: (section: number, line: number) => void;
```

State: `const [editingTab, setEditingTab] = useState<{ section: number; line: number } | null>(null);`

Section header — after the rhythm `Select` (inside the same `section.label !== null` condition), add:

```tsx
            {section.label !== null && (
              <SectionTempo
                value={section.tempo}
                songBpm={songBpm}
                onChange={(tempo) => onChange(updateSection(doc, sectionIndex, { tempo }))}
              />
            )}
```

Lines — before the existing `if (line.type === 'tab')`, add:

```tsx
            if (line.type === 'alphatex') {
              return (
                <div key={key} className="group flex items-start gap-1">
                  <TabStaff
                    block={line.block}
                    activeBeat={
                      active?.section === sectionIndex && active.line === lineIndex
                        ? active.beat
                        : null
                    }
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={t('playTab')}
                    onClick={() => onPlayTab(sectionIndex, lineIndex)}
                  >
                    {playingTab === key ? <Square /> : <Play />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={t('editTab')}
                    onClick={() => setEditingTab({ section: sectionIndex, line: lineIndex })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground"
                    aria-label={t('removeLine')}
                    onClick={() => onChange(removeLine(doc, sectionIndex, lineIndex))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              );
            }
```

Next to the «+ Строка» button, wrap both in `<div className="flex gap-1 self-start">` and add:

```tsx
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => {
                const at = section.lines.length;
                onChange(insertLine(doc, sectionIndex, at, alphatexLine([])));
                setEditingTab({ section: sectionIndex, line: at });
              }}
            >
              <Plus />
              {t('addTab')}
            </Button>
```

Before the closing `</div>` of the component (next to `ChordPalette`):

```tsx
      <TabEditorSheet
        source={(() => {
          const line = editingTab
            ? doc.sections[editingTab.section]?.lines[editingTab.line]
            : undefined;
          return line?.type === 'alphatex' ? line.source : null;
        })()}
        bpm={(editingTab ? doc.sections[editingTab.section]?.tempo : null) ?? songBpm}
        capo={capo}
        player={player}
        onSave={(source) => {
          if (editingTab) {
            onChange(setLine(doc, editingTab.section, editingTab.line, alphatexLine(source)));
          }
          setEditingTab(null);
        }}
        onClose={() => {
          const line = editingTab
            ? doc.sections[editingTab.section]?.lines[editingTab.line]
            : undefined;
          // A block that was added and never written is dropped.
          if (editingTab && line?.type === 'alphatex' && line.source.length === 0) {
            onChange(removeLine(doc, editingTab.section, editingTab.line));
          }
          setEditingTab(null);
        }}
      />
```

`source` must stay referentially stable between renders so the sheet's `useEffect` does not reset typing: `line.source` comes from `doc` and only changes when the doc changes, which does not happen while the sheet is open.

Add at the bottom of the file:

```tsx
/** The section's own tempo; empty shows the song tempo and means «as the song». */
function SectionTempo({
  value,
  songBpm,
  onChange,
}: {
  value: number | null;
  songBpm: number;
  onChange: (tempo: number | null) => void;
}) {
  const t = useTranslations('editor');
  const shown = value === null ? '' : String(value);
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);

  const commit = () => {
    const tempo = Number(text);
    if (!text) {
      onChange(null);
    } else if (isTempo(tempo)) {
      onChange(tempo);
    } else {
      setText(shown);
    }
  };

  return (
    <label className="flex items-center gap-1 text-muted-foreground text-xs">
      <Input
        type="number"
        inputMode="numeric"
        aria-label={t('sectionTempo')}
        placeholder={String(songBpm)}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            commit();
          }
        }}
        className="h-8 w-16 px-2 text-center tabular-nums"
      />
      bpm
    </label>
  );
}
```

- [ ] **Step 8: Update `chord-editor.tsx`**

Props: add `capo: number | null`. Imports: `beatAt`, `playingAt`, `sectionPlayback`, `tabPlayback` from `@/features/rhythm/playback`.

Replace the `playingSection`/`active` block:

```tsx
  const options = { bpm, capo };
  const playingId = player.playing ?? '';
  const sectionMatch = /^section:(\d+)$/.exec(playingId);
  const tabMatch = /^tab:(\d+:\d+)$/.exec(playingId);
  const playingSection = sectionMatch ? Number(sectionMatch[1]) : null;
  const playingTab = tabMatch?.[1] ?? null;

  const tabAt = (section: number, line: number) => {
    const found = doc.sections[section]?.lines[line];
    return found?.type === 'alphatex'
      ? tabPlayback(found.block, { ...options, bpm: doc.sections[section]?.tempo ?? bpm })
      : null;
  };

  let active: ActiveChord = null;
  if (playingSection !== null) {
    active = playingAt(sectionPlayback(doc, rhythms, playingSection, options), player.position);
  } else if (playingTab) {
    const [section = 0, line = 0] = playingTab.split(':').map(Number);
    const playback = tabAt(section, line);
    active = playback
      ? { section, line, item: null, beat: beatAt(playback, player.position) }
      : null;
  }
```

`VisualEditor` gets:

```tsx
          songBpm={bpm}
          capo={capo}
          player={player}
          playingSection={playingSection}
          onPlaySection={(section) => {
            const { notes } = sectionPlayback(doc, rhythms, section, options);
            player.toggle(`section:${section}`, notes);
          }}
          playingTab={playingTab}
          onPlayTab={(section, line) => {
            const playback = tabAt(section, line);
            if (playback) {
              player.toggle(`tab:${section}:${line}`, playback.notes);
            }
          }}
```

- [ ] **Step 9: Pass `capo` from `song-form.tsx`**

`<ChordEditor … capo={fields.capo} … />`.

- [ ] **Step 10: Run tests, types, lint**

Run: `cd apps/web && bun test src` → PASS.
Run: `bunx turbo run check-types` and `bun run lint` → no errors.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/features/tab apps/web/src/features/editor apps/web/messages
git commit -m "Edit tab blocks and section tempo in the song editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Convert Obsidian `jtab` blocks to alphaTex on import

**Files:**
- Create: `packages/chord-sheet/src/jtab.ts`
- Create: `packages/chord-sheet/src/jtab.test.ts`
- Modify: `packages/chord-sheet/src/import-obsidian.ts`
- Modify: `packages/chord-sheet/src/import-obsidian.test.ts`
- Modify: `packages/chord-sheet/src/index.ts`

**Interfaces:**
- Consumes: `alphatexLine` (Task 2), `Section` with `tempo` (Task 2).
- Produces: `jtabToAlphaTex(source: string): string[] | null`.

- [ ] **Step 1: Write the failing tests**

`packages/chord-sheet/src/jtab.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { parseAlphaTex } from './alphatex';
import { jtabToAlphaTex } from './jtab';

describe('jtabToAlphaTex', () => {
  test('even bars become eighth notes, one output line per jtab line', () => {
    const source = [
      '$5 0 $3 5 $2 8 $5 0 $3 5 $2 5 $5 0 $3 5 | $2 6 $5 0 $3 5 $2 5 $5 0 $3 5 $2 5 $3 5 |',
      '',
      '$4 3 $3 5 $1 3 $4 3 $3 5 $2 5 $4 3 $3 5 |',
    ].join('\n');
    const lines = jtabToAlphaTex(source);
    expect(lines).toEqual([
      ':8 0.5 5.3 8.2 0.5 5.3 5.2 0.5 5.3 | 6.2 0.5 5.3 5.2 0.5 5.3 5.2 5.3 |',
      '3.4 5.3 3.1 3.4 5.3 5.2 3.4 5.3 |',
    ]);
    expect(parseAlphaTex(lines ?? []).diagnostics).toEqual([]);
  });

  test('uneven bars or foreign tokens are not converted', () => {
    expect(jtabToAlphaTex('$5 0 $3 5 | $2 6 $5 0 $3 5 |')).toBeNull();
    expect(jtabToAlphaTex('$5 0 $3 5 $2 8')).toBeNull();
    expect(jtabToAlphaTex('Am G | $5 0')).toBeNull();
    expect(jtabToAlphaTex('')).toBeNull();
  });
});
```

In `import-obsidian.test.ts`, replace the two jtab expectations of the `Гореть` test:

```ts
    expect(song.notes).not.toContain('```jtab');
    expect(song.notes).not.toContain('**Проигрыш**');
    const riff = doc.sections.find((section) => section.label === 'Проигрыш');
    const block = riff?.lines[0];
    expect(block?.type).toBe('alphatex');
    expect(block?.type === 'alphatex' && block.block.bars).toHaveLength(8);
    expect(block?.type === 'alphatex' && block.block.bars[0]?.beats[0]?.duration).toBe(8);
```

(`doc` is already `parse(song.content).doc` in that test; if `Проигрыш` also exists as a section in the fixture's chords block, the block goes into that section instead — the `find` still holds.)

- [ ] **Step 2: Run to verify they fail**

Run: `cd packages/chord-sheet && bun test src/jtab.test.ts src/import-obsidian.test.ts`
Expected: FAIL — module missing; jtab still in notes.

- [ ] **Step 3: Write `jtab.ts`**

```ts
const EVEN_COUNTS = new Set([1, 2, 4, 8, 16]);
const STRING_RE = /^\$([1-6])$/;
const FRET_RE = /^\d{1,2}$/;

/** `$5 0 $3 5` → `['0.5', '5.3']`; `null` when anything else is in the bar. */
function barNotes(bar: string): string[] | null {
  const tokens = bar.split(/\s+/).filter(Boolean);
  if (tokens.length % 2 !== 0) {
    return null;
  }
  const notes: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const string = STRING_RE.exec(tokens[i] ?? '')?.[1];
    const fret = tokens[i + 1] ?? '';
    if (!string || !FRET_RE.test(fret)) {
      return null;
    }
    notes.push(`${fret}.${string}`);
  }
  return notes;
}

/**
 * Obsidian jtab (`$string fret`, bars split by `|`) → alphaTex, when every bar has the same
 * 1, 2, 4, 8 or 16 notes: they become `:N` notes in 4/4. Otherwise `null`: the timing is unknown.
 */
export function jtabToAlphaTex(source: string): string[] | null {
  const rows = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split('|')
        .map((bar) => bar.trim())
        .filter(Boolean)
        .map(barNotes),
    );
  const bars = rows.flat();
  const count = bars[0]?.length ?? 0;
  if (
    bars.length === 0 ||
    !EVEN_COUNTS.has(count) ||
    bars.some((bar) => bar === null || bar.length !== count)
  ) {
    return null;
  }
  return rows.map(
    (row, index) =>
      `${index === 0 ? `:${count} ` : ''}${row.map((bar) => (bar ?? []).join(' ')).join(' | ')} |`,
  );
}
```

- [ ] **Step 4: Use it in `importObsidian`**

Imports: `import { alphatexLine } from './alphatex';` and `import { jtabToAlphaTex } from './jtab';`.

State next to `notes`:

```ts
  const tabs: { label: string | null; source: string[] }[] = [];
  let fenceLines: string[] = [];
  /** `**Проигрыш**` right before a fence names the tab in it. */
  let lastBold: string | null = null;
```

In the `fence === null` branch, when a fence opens:

```ts
      if (trimmed.startsWith('```')) {
        fence = trimmed.slice(3).trim();
        fenceLines = [];
        if (fence === 'chords') {
          if (sheet.length > 0) {
            sheet.push('');
          }
        } else if (fence !== 'jtab') {
          notes.push(trimmed);
        }
        continue;
      }
```

and where a plain line goes to notes (`if (!readMeta(line, null) && trimmed) { notes.push(line.trimEnd()); }`), track the bold heading:

```ts
      if (!readMeta(line, null) && trimmed) {
        notes.push(line.trimEnd());
        lastBold = BOLD_RE.exec(trimmed)?.[1]?.trim() ?? null;
      }
      continue;
```

with `const BOLD_RE = /^\*\*(.+?)\*\*$/;` at the top of the file.

When the fence closes:

```ts
    if (trimmed === '```') {
      if (fence === 'jtab') {
        const source = jtabToAlphaTex(fenceLines.join('\n'));
        if (source) {
          if (lastBold !== null && notes.at(-1) === `**${lastBold}**`) {
            notes.pop();
          }
          tabs.push({ label: lastBold, source });
        } else {
          notes.push('```jtab', ...fenceLines, '```');
        }
      } else if (fence !== 'chords') {
        notes.push(trimmed);
      }
      fence = null;
      lastBold = null;
      continue;
    }
    if (fence === 'jtab') {
      fenceLines.push(line.trimEnd());
      continue;
    }
```

(keep the existing `if (fence !== 'chords') { notes.push(line.trimEnd()); continue; }` after it for other fences).

After `markSectionRhythms(…)`:

```ts
  for (const tab of tabs) {
    const line = alphatexLine(tab.source);
    const label = tab.label?.toLowerCase();
    const target = label
      ? doc.sections.find((section) => section.label?.toLowerCase() === label)
      : undefined;
    if (target) {
      target.lines.push(line);
    } else {
      doc.sections.push({ label: tab.label ?? 'Таб', rhythm: null, tempo: null, lines: [line] });
    }
  }
```

Update the `importObsidian` doc comment: "…```jtab blocks with even bars become alphaTex tabs in the section named by the `**heading**` before them. Everything else goes to `notes`."

- [ ] **Step 5: Export and run**

`index.ts`: `export * from './jtab';`.
Run: `cd packages/chord-sheet && bun test` → PASS.
Run: `bunx turbo run check-types` and `bun run lint` → no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/chord-sheet/src
git commit -m "Convert Obsidian jtab blocks to alphaTex on import

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Whole-branch check

- [ ] **Step 1: Full test suite, types, lint**

Run: `bun run test && bunx turbo run check-types && bun run lint` from the repo root.
Expected: all green.

- [ ] **Step 2: Hand-off for manual UI check**

Tell the user what to click through (they verify UI themselves): create a song, add a section with `140bpm`, add a tab via «+ Таб», paste the riff, check the preview/▶/errors, save, open the song page, Listen at 0.75×, zen mode with a tab block, import the `LUMEN - Гореть` Obsidian note.
