# Stage B — Listener Capo and Recalculating for a Capo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A listener picks a capo fret and the song's chords and alphaTex tabs are rewritten for it with the same sound; easy capo positions are marked ★; the author gets the same hints and can recalculate the song when changing the capo.

**Architecture:** Pure functions in `packages/chord-sheet` transpose chord names (`transpose.ts`), move tab notes to other frets/strings (`refret.ts`, which also rewrites the alphaTex source in place) and apply both to a whole document (`capo.ts`). `packages/audio` scores capo positions with the voicing search (`capo-hints.ts`). The song page keeps the listener's capo per song in localStorage and renders a recalculated document; the editor asks before recalculating.

**Tech Stack:** TypeScript 6, Bun test, React 19 / Next 16, Tailwind v4, next-intl, base-ui, Biome.

**Spec:** `docs/superpowers/specs/2026-10-03-chords-capo-zen-design.md` (section 9 and «Настройки на устройстве»).

**Depends on stage A** (`docs/superpowers/plans/2026-10-03-chords-a-voicings.md`): `songTuning`, `chordKey`, `chordList`, `ZenModeId`, `isZenMode` (chord-sheet); `voicingsFor` (audio); `SongSound`, `songSound` (`apps/web/src/features/rhythm/playback.ts`); `ChordSidebar`/`ChordStrip`/`useChordBrowser` in `song-view.tsx`.

## Global Constraints

- Shapes move by `from − to` semitones (author capo → listener capo); the sound never changes: every scheduled MIDI note is the same before and after.
- Note spelling follows the song: flats if the author wrote more `b` than `#` in chord roots and basses, sharps otherwise; if any chord uses `H`, B natural is written `H`.
- A tab note at pitch `p = strings[6 − string] + from + fret` goes to fret `p − strings[6 − string'] − to`, which must be 0–24; first its own string, then the others by distance, thicker first on a tie; two notes of one beat never share a string; a tie follows the note it ties to; a note that fits nowhere stays on its string with a negative fret and `unreachable: true`.
- A hammer/slide mark is dropped from the block when the note and the next note of its original string end up on different strings (the alphaTex source keeps its `{h}`/`{sl}` text).
- ASCII tabs (`{start_of_tab}`) are never changed; with a listener capo they get the caption «Таб для каподастра N».
- Capo hints cover frets 0–7: the cost is the sum over the song's chords of the first voicing's cost (a chord with no voicing costs 10); ★ marks the best position and also the second best if its cost is within 1 of the best; «без баррэ» marks positions where no first voicing is a barre.
- Listener settings: `localStorage['chordtune.song.<arrangementId>']` = `{ "capo": number | null, "zenMode": "inline" | "strip" | null }`; `capo: null` means «как у автора»; unreadable or invalid values read as `null`.
- The author's voicings apply only when the listener's capo equals the author's.
- Editor: recalculating is offered when the capo changes and the song has chords or alphaTex blocks; it is impossible (button disabled, reason shown) when any tab note would be unreachable or a block's source cannot be rewritten.
- UI copy in `apps/web/messages/ru.json` and `en.json`; UI is verified by the user by hand (no screenshots).
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Commands: `cd packages/<pkg> && bun test <file>`; `cd apps/web && bun test <file>`; root `bunx turbo run check-types`, `bun run lint`.

## Review Focus

1. Picking the author's fret («Как у автора») shows exactly the author's song — `withCapo` returns the same document when `from === to` (Task 3 test); chord names survive a round trip (Task 3 test).
2. A tab with a tie (`-.3`) whose note moves to another string keeps the tie on the new string (Task 2 test).
3. A song with no chords and no tabs: changing the capo in the editor just sets it, no dialog (Task 6).
4. `Hm` songs stay in `H` notation after a capo change (Task 1 test).
5. An alphaTex block with a parse error is never rewritten by «Пересчитать» (Task 2 `rewriteAlphaTex` returns null; Task 3 `stale`).

---

### Task 1: Transposing chord names

**Files:**
- Create: `packages/chord-sheet/src/transpose.ts`
- Create: `packages/chord-sheet/src/transpose.test.ts`
- Modify: `packages/chord-sheet/src/index.ts`

**Interfaces:**
- Consumes: `parseChord`, `pitchClass` (`chord.ts`); `SongDoc` (`types.ts`).
- Produces: `type Spelling = { accidental: 'sharp' | 'flat'; germanH: boolean }`, `spellingOf(doc: SongDoc): Spelling`, `transposeChord(raw: string, semitones: number, spelling: Spelling): string` (returns `raw` unchanged when it is not a chord).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';

import { parse } from './parse';
import { spellingOf, transposeChord } from './transpose';

const SHARP = { accidental: 'sharp', germanH: false } as const;
const FLAT = { accidental: 'flat', germanH: false } as const;

describe('transposeChord', () => {
  test('root and bass move, the suffix stays', () => {
    expect(transposeChord('F', -3, SHARP)).toBe('D');
    expect(transposeChord('F#m7/C#', -3, SHARP)).toBe('D#m7/A#');
    expect(transposeChord('F#m7/C#', -3, FLAT)).toBe('Ebm7/Bb');
    expect(transposeChord('Am', 14, SHARP)).toBe('Bm');
    expect(transposeChord('C', -13, FLAT)).toBe('B');
  });

  test('German H', () => {
    expect(transposeChord('Hm', 0, { accidental: 'sharp', germanH: true })).toBe('Hm');
    expect(transposeChord('Am', 2, { accidental: 'sharp', germanH: true })).toBe('Hm');
    expect(transposeChord('C', -2, { accidental: 'flat', germanH: true })).toBe('Bb');
  });

  test('not a chord', () => {
    expect(transposeChord('Куплет', 3, SHARP)).toBe('Куплет');
  });
});

describe('spellingOf', () => {
  test('flats when the author writes more flats', () => {
    expect(spellingOf(parse('${Bb}a ${Eb}b ${F#}c').doc)).toEqual({ accidental: 'flat', germanH: false });
    expect(spellingOf(parse('${C#}a ${F#}b ${Bb}c').doc)).toEqual({ accidental: 'sharp', germanH: false });
    expect(spellingOf(parse('${C}a').doc)).toEqual({ accidental: 'sharp', germanH: false });
  });

  test('H anywhere keeps H', () => {
    expect(spellingOf(parse('${Hm}a ${A/H}b').doc).germanH).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/chord-sheet && bun test src/transpose.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 3: Write `transpose.ts`**

```ts
import { parseChord, pitchClass } from './chord';
import type { SongDoc } from './types';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** How a song spells notes: sharps or flats, and `H` for B natural. */
export type Spelling = { accidental: 'sharp' | 'flat'; germanH: boolean };

/** Flats if the song's chords use more `b` than `#`; `H` if any chord is written with it. */
export function spellingOf(doc: SongDoc): Spelling {
  let sharps = 0;
  let flats = 0;
  let germanH = false;
  for (const section of doc.sections) {
    for (const line of section.lines) {
      if (line.type !== 'line') {
        continue;
      }
      for (const item of line.items) {
        if (item.type !== 'chord' || !parseChord(item.chord)) {
          continue;
        }
        const [name = '', bass = ''] = item.chord.split('/');
        for (const note of [name.slice(0, 2), bass.slice(0, 2)]) {
          if (note[1] === '#') {
            sharps++;
          } else if (note[1] === 'b') {
            flats++;
          }
          if (note[0] === 'H') {
            germanH = true;
          }
        }
      }
    }
  }
  return { accidental: flats > sharps ? 'flat' : 'sharp', germanH };
}

/** `raw` moved by `semitones`, spelled per `spelling`; anything that is not a chord stays. */
export function transposeChord(raw: string, semitones: number, spelling: Spelling): string {
  const chord = parseChord(raw);
  if (!chord) {
    return raw;
  }
  const names = spelling.accidental === 'flat' ? FLATS : SHARPS;
  const name = (note: string) => {
    const spelled = names[(((pitchClass(note) + semitones) % 12) + 12) % 12] ?? note;
    return spelling.germanH && spelled === 'B' ? 'H' : spelled;
  };
  return `${name(chord.root)}${chord.suffix}${chord.bass ? `/${name(chord.bass)}` : ''}`;
}
```

Add `export * from './transpose';` to `index.ts`.

- [ ] **Step 4: Run tests** — `cd packages/chord-sheet && bun test` → PASS; root types/lint clean.

- [ ] **Step 5: Commit**

```bash
git add packages/chord-sheet/src
git commit -m "Transpose chord names in the song's spelling

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Moving tab notes for another capo, rewriting the alphaTex source

**Files:**
- Create: `packages/chord-sheet/src/refret.ts`
- Create: `packages/chord-sheet/src/refret.test.ts`
- Modify: `packages/chord-sheet/src/tab.ts` (`TabNote.unreachable`)
- Modify: `packages/chord-sheet/src/alphatex.ts` (export `alphaTexNoteTokens`)
- Modify: `packages/chord-sheet/src/index.ts`
- Modify: `apps/web/src/features/tab/tab-staff.tsx` (draw unreachable notes)

**Interfaces:**
- Consumes: `parseAlphaTex`, tokenizer internals (`alphatex.ts`); `TabBlock`, `TabNote` (`tab.ts`).
- Produces:
  - `TabNote` gains `unreachable?: true` (set only by `refretBlock`).
  - `alphaTexNoteTokens(lines: readonly string[]): { line: number; col: number; text: string }[]` — every `fret.string[.duration]` word in written order; `line` is the 0-based index into `lines`, `col` the 0-based column.
  - `refretBlock(block: TabBlock, strings: readonly number[], from: number, to: number): { block: TabBlock; unreachable: number }`.
  - `rewriteAlphaTex(source: readonly string[], before: TabBlock, after: TabBlock): string[] | null` — `null` when the note tokens do not line up with `before`'s notes (the source has errors) or a note in `after` is unreachable.
  - `countUnreachable(block: TabBlock): number`.

- [ ] **Step 1: Write the failing test**

`packages/chord-sheet/src/refret.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { parseAlphaTex } from './alphatex';
import { countUnreachable, refretBlock, rewriteAlphaTex } from './refret';
import type { TabBlock } from './tab';
import { GUITAR_TUNINGS } from './tuning';

const STANDARD = GUITAR_TUNINGS.standard;
const block = (source: string) => parseAlphaTex(source.split('\n')).block;
const notes = (tab: TabBlock) =>
  tab.bars.flatMap((bar) => bar.beats.map((beat) => beat.notes.map((n) => `${n.fret}.${n.string}`).join('+')));
const pitches = (tab: TabBlock, capo: number) =>
  tab.bars.flatMap((bar) =>
    bar.beats.flatMap((beat) =>
      beat.notes.map((n) => (n.fret === 'x' ? 'x' : (STANDARD[6 - n.string] ?? 0) + n.fret + capo)),
    ),
  );

describe('refretBlock', () => {
  test('capo down: same strings, higher frets', () => {
    const tab = block('0.1 3.2 (0.5 2.4)');
    const moved = refretBlock(tab, STANDARD, 2, 0);
    expect(notes(moved.block)).toEqual(['2.1', '5.2', '2.5+4.4']);
    expect(moved.unreachable).toBe(0);
    expect(pitches(moved.block, 0)).toEqual(pitches(tab, 2));
  });

  test('capo up: an open note moves to a thicker string', () => {
    const moved = refretBlock(block('0.1 5.2'), STANDARD, 0, 2);
    // E4 open → B string 3rd fret with capo 2; E4 on B 5 → B 3.
    expect(notes(moved.block)).toEqual(['3.2', '3.2']);
    expect(pitches(moved.block, 2)).toEqual(pitches(block('0.1 5.2'), 0));
  });

  test('two notes of one beat never share a string', () => {
    const tab = block('(0.1 3.2)');
    const moved = refretBlock(tab, STANDARD, 0, 2);
    const strings = moved.block.bars[0]?.beats[0]?.notes.map((n) => n.string) ?? [];
    expect(new Set(strings).size).toBe(2);
    expect(pitches(moved.block, 2)).toEqual(pitches(tab, 0));
  });

  test('a note below the capo on the low E is unreachable but keeps its pitch', () => {
    const moved = refretBlock(block('0.6 2.6'), STANDARD, 0, 3);
    expect(moved.unreachable).toBe(2);
    expect(moved.block.bars[0]?.beats[0]?.notes[0]).toMatchObject({ string: 6, fret: -3, unreachable: true });
    expect(countUnreachable(moved.block)).toBe(2);
    expect(pitches(moved.block, 3)).toEqual([40, 42]);
  });

  test('a tie follows its note to the new string', () => {
    const moved = refretBlock(block('0.1 -.1'), STANDARD, 0, 2);
    expect(notes(moved.block)).toEqual(['3.2', '3.2']);
    expect(moved.block.bars[0]?.beats[1]?.notes[0]?.tie).toBe(true);
  });

  test('dead notes stay, hammer-ons across strings are dropped', () => {
    const moved = refretBlock(block('x.1 0.1{h} 2.1'), STANDARD, 0, 1);
    expect(notes(moved.block)).toEqual(['x.1', '4.2', '1.1']);
    expect(moved.block.bars[0]?.beats[1]?.notes[0]?.effects.hammer).toBeUndefined();
    const kept = refretBlock(block('2.1{h} 4.1'), STANDARD, 0, 1);
    expect(kept.block.bars[0]?.beats[0]?.notes[0]?.effects.hammer).toBe(true);
  });
});

describe('rewriteAlphaTex', () => {
  test('only the note numbers change', () => {
    const source = ['\\tempo 90', '\\lyrics "ла"', ':8 0.1{h} 3.2 | (0.5 2.4).4 -.4 r'];
    const before = parseAlphaTex(source).block;
    const after = refretBlock(before, STANDARD, 2, 0).block;
    expect(rewriteAlphaTex(source, before, after)).toEqual([
      '\\tempo 90',
      '\\lyrics "ла"',
      ':8 2.1{h} 5.2 | (2.5 4.4).4 -.4 r',
    ]);
  });

  test('null when the source has a bad note or a note is unreachable', () => {
    const broken = ['0.1 3.9 2.2'];
    const before = parseAlphaTex(broken).block;
    expect(rewriteAlphaTex(broken, before, refretBlock(before, STANDARD, 1, 0).block)).toBeNull();
    const low = ['0.6'];
    const lowBlock = parseAlphaTex(low).block;
    expect(rewriteAlphaTex(low, lowBlock, refretBlock(lowBlock, STANDARD, 0, 3).block)).toBeNull();
  });
});
```

Notes on the expected values (standard tuning, MIDI: E2 40, A2 45, D3 50, G3 55, B3 59, E4 64):
- `0.1 5.2` capo 0 → 2: E4 (64) on string 1 needs fret 64 − 64 − 2 = −2 → string 2: 64 − 59 − 2 = 3 → `3.2`; `5.2` is 59 + 5 = 64 → fret 64 − 59 − 2 = 3 → `3.2`.
- `x.1 0.1{h} 2.1` capo 0 → 1: `0.1` (64) → string 2 fret 4; `2.1` (66) → string 1 fret 1; the hammer from `0.1` to `2.1` crosses strings, so it is dropped.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd packages/chord-sheet && bun test src/refret.test.ts` — Expected: FAIL, module missing.

- [ ] **Step 3: `TabNote.unreachable` and the note tokens**

`tab.ts`, in `TabNote`:

```ts
/** `string` 1 is the high E. A tie holds the previous fret on the string without a new attack. */
export type TabNote = {
  string: number;
  fret: number | 'x';
  tie: boolean;
  effects: NoteEffects;
  /** Set when a capo leaves no fret for the note: `fret` is then below the capo. */
  unreachable?: true;
};
```

`alphatex.ts`, after `tokenize`:

```ts
/** Every note word (`fret.string[.duration]`) in written order, with its 0-based place. */
export function alphaTexNoteTokens(
  lines: readonly string[],
): { line: number; col: number; text: string }[] {
  return tokenize(lines, 0, [])
    .filter((token) => token.kind === 'word' && NOTE_RE.test(token.value))
    .map((token) => ({ line: token.line, col: token.col - 1, text: token.value }));
}
```

- [ ] **Step 4: Write `refret.ts`**

```ts
import { alphaTexNoteTokens } from './alphatex';
import type { TabBlock, TabNote } from './tab';

const MAX_FRET = 24;
const NOTE_RE = /^(\d+|x|-)\.(\d+)(?:\.(\d+))?$/;

type Place = { string: number; fret: number };

/**
 * The block for a capo at `to` instead of `from`, sounding the same: each note keeps its pitch
 * and goes to its own string if a fret fits, else to the nearest string that has one (thicker
 * first), never sharing a string within a beat; a tie follows its note. Notes that fit nowhere
 * stay with a negative fret and `unreachable`. Hammer/slide marks between notes that end up on
 * different strings are dropped.
 */
export function refretBlock(
  block: TabBlock,
  strings: readonly number[],
  from: number,
  to: number,
): { block: TabBlock; unreachable: number } {
  const count = strings.length;
  const open = (string: number) => strings[count - string] ?? 0;
  const placedOn = new Map<number, Place>();
  let unreachable = 0;

  const place = (note: TabNote, taken: Set<number>): TabNote => {
    if (note.fret === 'x') {
      taken.add(note.string);
      return note;
    }
    if (note.tie) {
      const held = placedOn.get(note.string) ?? { string: note.string, fret: note.fret };
      taken.add(held.string);
      return { ...note, string: held.string, fret: held.fret };
    }
    const pitch = open(note.string) + from + note.fret;
    const candidates = Array.from({ length: count }, (_, i) => i + 1).sort(
      (a, b) => Math.abs(a - note.string) - Math.abs(b - note.string) || b - a,
    );
    for (const string of candidates) {
      const fret = pitch - open(string) - to;
      if (!taken.has(string) && fret >= 0 && fret <= MAX_FRET) {
        taken.add(string);
        placedOn.set(note.string, { string, fret });
        return { ...note, string, fret };
      }
    }
    unreachable++;
    const fret = pitch - open(note.string) - to;
    taken.add(note.string);
    placedOn.set(note.string, { string: note.string, fret });
    return { ...note, fret, unreachable: true };
  };

  const bars = block.bars.map((bar) => ({
    ...bar,
    beats: bar.beats.map((beat) => {
      const taken = new Set<number>();
      // Dead notes and ties have fixed strings: place them before the others.
      const order = beat.notes
        .map((note, index) => ({ note, index }))
        .sort((a, b) => rank(a.note) - rank(b.note));
      const placed: TabNote[] = [...beat.notes];
      for (const { note, index } of order) {
        placed[index] = place(note, taken);
      }
      return { ...beat, notes: placed };
    }),
  }));

  return { block: { ...block, bars: dropBrokenLegato(block, bars) }, unreachable };
}

const rank = (note: TabNote) => (note.fret === 'x' ? 0 : note.tie ? 1 : 2);

/** Written-order list of `[before, after]` notes, so effects can look at the next note. */
function pairs(before: TabBlock['bars'], after: TabBlock['bars']) {
  return before.flatMap((bar, b) =>
    bar.beats.flatMap((beat, k) =>
      beat.notes.map((note, n) => ({
        before: note,
        after: after[b]?.beats[k]?.notes[n] ?? note,
        at: [b, k, n] as const,
      })),
    ),
  );
}

function dropBrokenLegato(original: TabBlock, bars: TabBlock['bars']): TabBlock['bars'] {
  const all = pairs(original.bars, bars);
  for (const [i, { before, after, at }] of all.entries()) {
    if (!before.effects.hammer && !before.effects.slide) {
      continue;
    }
    const next = all.slice(i + 1).find((other) => other.before.string === before.string);
    // Nothing to slur to, or both still on one string: the mark stays.
    if (next && after.string !== next.after.string) {
      const { hammer: _hammer, slide: _slide, ...rest } = after.effects;
      const beat = bars[at[0]]?.beats[at[1]];
      if (beat) {
        beat.notes[at[2]] = { ...after, effects: rest };
      }
    }
  }
  return bars;
}

export function countUnreachable(block: TabBlock): number {
  return block.bars.reduce(
    (sum, bar) =>
      sum +
      bar.beats.reduce((inBar, beat) => inBar + beat.notes.filter((n) => n.unreachable).length, 0),
    0,
  );
}

/**
 * `source` with every note's fret and string replaced from `after` (durations, effects, text and
 * spacing stay). Null when the note words do not line up with `before` (the block has errors) or
 * a note of `after` is unreachable — such a block cannot be written back.
 */
export function rewriteAlphaTex(
  source: readonly string[],
  before: TabBlock,
  after: TabBlock,
): string[] | null {
  const tokens = alphaTexNoteTokens(source);
  const flat = (tab: TabBlock) => tab.bars.flatMap((bar) => bar.beats.flatMap((beat) => beat.notes));
  const beforeNotes = flat(before);
  const afterNotes = flat(after);
  if (tokens.length !== beforeNotes.length || afterNotes.some((note) => note.unreachable)) {
    return null;
  }
  const lines = [...source];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    const note = afterNotes[i];
    const match = token ? NOTE_RE.exec(token.text) : null;
    if (!token || !note || !match) {
      return null;
    }
    const fret = match[1] === '-' || match[1] === 'x' ? match[1] : String(note.fret);
    const duration = match[3] !== undefined ? `.${match[3]}` : '';
    const text = lines[token.line] ?? '';
    lines[token.line] =
      text.slice(0, token.col) + `${fret}.${note.string}${duration}` + text.slice(token.col + token.text.length);
  }
  return lines;
}
```

Add `export * from './refret';` to `index.ts`.

Note: `dropBrokenLegato` mutates the freshly built `bars` arrays (never the input block).

- [ ] **Step 5: Draw unreachable notes in `tab-staff.tsx`**

In `NoteMark`:

```tsx
  const label = note.unreachable
    ? '?'
    : note.fret === 'x'
      ? 'x'
      : note.tie
        ? `(${note.fret})`
        : String(note.fret);
```

and the fret text class becomes:

```tsx
        className={cn(
          'stroke-[4px] stroke-background font-mono text-[11px]',
          note.unreachable ? 'fill-destructive' : active ? 'fill-primary' : 'fill-foreground',
        )}
```

- [ ] **Step 6: Run tests, types, lint**

Run: `cd packages/chord-sheet && bun test` → PASS. Root: `bunx turbo run check-types`, `bun run lint` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/chord-sheet/src apps/web/src/features/tab/tab-staff.tsx
git commit -m "Move tab notes for another capo and rewrite the alphaTex source

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `withCapo` for a whole song

**Files:**
- Create: `packages/chord-sheet/src/capo.ts`
- Create: `packages/chord-sheet/src/capo.test.ts`
- Modify: `packages/chord-sheet/src/index.ts`

**Interfaces:**
- Consumes: `spellingOf`, `transposeChord` (Task 1); `refretBlock`, `rewriteAlphaTex` (Task 2); `SongDoc`.
- Produces: `withCapo(doc: SongDoc, strings: readonly number[], from: number, to: number): { doc: SongDoc; unreachable: number; stale: number }` — `stale` counts alphaTex blocks whose source could not be rewritten (their `block` is still recalculated, their `source` is left as is).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';

import { withCapo } from './capo';
import { parse } from './parse';
import { serialize } from './serialize';
import { GUITAR_TUNINGS } from './tuning';

const STANDARD = GUITAR_TUNINGS.standard;
const SONG = [
  '[Куплет]',
  '${F}Мы ${C}идём ${Dm}домой',
  '{start_of_tab}',
  'e|---0---|',
  '{end_of_tab}',
  '{start_of_alphatex}',
  '3.2 1.2 0.3',
  '{end_of_alphatex}',
].join('\n');

describe('withCapo', () => {
  test('chords move, alphaTex is rewritten, ASCII tabs stay', () => {
    const { doc, unreachable, stale } = withCapo(parse(SONG).doc, STANDARD, 0, 5);
    expect(unreachable).toBe(0);
    expect(stale).toBe(0);
    const text = serialize(doc);
    expect(text).toContain('${C}Мы ${G}идём ${Am}домой');
    expect(text).toContain('e|---0---|');
    expect(text).not.toContain('3.2 1.2 0.3');
  });

  test('chord names survive a round trip', () => {
    // Tab notes may come back on other strings (each move prefers the note's current string),
    // so the round trip is checked on chords only.
    const original = parse('${F}Мы ${C}идём ${Dm}домой ${Am7}всегда').doc;
    const there = withCapo(original, STANDARD, 0, 3).doc;
    expect(serialize(there)).toContain('${D}Мы ${A}идём ${Bm}домой ${F#m7}всегда');
    const back = withCapo(there, STANDARD, 3, 0).doc;
    expect(serialize(back)).toBe(serialize(original));
  });

  test('same capo: the very same document', () => {
    const doc = parse(SONG).doc;
    expect(withCapo(doc, STANDARD, 2, 2).doc).toBe(doc);
  });

  test('unreachable notes and stale blocks are counted', () => {
    const low = parse('{start_of_alphatex}\n0.6 2.6\n{end_of_alphatex}').doc;
    expect(withCapo(low, STANDARD, 0, 3)).toMatchObject({ unreachable: 2, stale: 1 });
    const broken = parse('{start_of_alphatex}\n0.1 3.9\n{end_of_alphatex}').doc;
    expect(withCapo(broken, STANDARD, 1, 0)).toMatchObject({ unreachable: 0, stale: 1 });
  });
});
```

(`3.2 1.2 0.3` at capo 0 → 5 sounds D4, C4, G3; standard with capo 5 puts them on lower strings — the exact frets are pinned by Task 2's tests; here only «the source changed» is checked.)

- [ ] **Step 2: Run it to verify it fails** — `cd packages/chord-sheet && bun test src/capo.test.ts` → FAIL, module missing.

- [ ] **Step 3: Write `capo.ts`**

```ts
import { refretBlock, rewriteAlphaTex } from './refret';
import { spellingOf, transposeChord } from './transpose';
import type { Line, SongDoc } from './types';

/**
 * The song for a capo at `to` instead of `from`, sounding the same: chord names move by
 * `from − to` semitones in the song's spelling, alphaTex notes move to other frets/strings and
 * their source is rewritten, ASCII tabs stay as written.
 */
export function withCapo(
  doc: SongDoc,
  strings: readonly number[],
  from: number,
  to: number,
): { doc: SongDoc; unreachable: number; stale: number } {
  if (from === to) {
    return { doc, unreachable: 0, stale: 0 };
  }
  const shift = from - to;
  const spelling = spellingOf(doc);
  let unreachable = 0;
  let stale = 0;

  const move = (line: Line): Line => {
    if (line.type === 'line') {
      return {
        ...line,
        items: line.items.map((item) =>
          item.type === 'chord' ? { ...item, chord: transposeChord(item.chord, shift, spelling) } : item,
        ),
      };
    }
    if (line.type === 'alphatex') {
      const moved = refretBlock(line.block, strings, from, to);
      unreachable += moved.unreachable;
      const source = rewriteAlphaTex(line.source, line.block, moved.block);
      if (!source) {
        stale++;
      }
      return { ...line, block: moved.block, source: source ?? line.source };
    }
    return line;
  };

  return {
    doc: { ...doc, sections: doc.sections.map((section) => ({ ...section, lines: section.lines.map(move) })) },
    unreachable,
    stale,
  };
}
```

Add `export * from './capo';` to `index.ts`.

- [ ] **Step 4: Run tests** — `cd packages/chord-sheet && bun test` → PASS; root types/lint clean.

- [ ] **Step 5: Commit**

```bash
git add packages/chord-sheet/src
git commit -m "Recalculate a whole song for another capo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Capo hints

**Files:**
- Create: `packages/audio/src/capo-hints.ts`
- Create: `packages/audio/src/capo-hints.test.ts`
- Modify: `packages/audio/src/index.ts`

**Interfaces:**
- Consumes: `chordList`, `spellingOf`, `transposeChord`, `SongDoc` (chord-sheet); `voicingsFor` (`voicing.ts`).
- Produces: `type CapoHint = { capo: number; cost: number; barres: number; star: boolean; noBarre: boolean }`, `MAX_HINT_CAPO = 7`, `capoHints(doc: SongDoc, strings: readonly number[], authorCapo: number): CapoHint[]` (one per fret 0–7, in fret order).

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, test } from 'bun:test';
import { GUITAR_TUNINGS, parse } from '@chordtune/chord-sheet';

import { capoHints } from './capo-hints';

const STANDARD = GUITAR_TUNINGS.standard;

describe('capoHints', () => {
  test('F C Dm without a capo: the 5th fret (C G Am) is easiest and has no barre', () => {
    const hints = capoHints(parse('${F}a ${C}b ${Dm}c').doc, STANDARD, 0);
    expect(hints.map((hint) => hint.capo)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const starred = hints.filter((hint) => hint.star).map((hint) => hint.capo);
    expect(starred).toContain(5);
    expect(starred.length).toBeLessThanOrEqual(2);
    expect(hints[5]?.noBarre).toBe(true);
    expect(hints[3]?.noBarre).toBe(false); // D A Bm — Bm is a barre
    expect(hints[0]?.noBarre).toBe(false); // F is a barre
  });

  test('relative to the author capo', () => {
    // Written as C G Am with capo 5: fret 5 is the same easy shapes.
    const hints = capoHints(parse('${C}a ${G}b ${Am}c').doc, STANDARD, 5);
    expect(hints[5]?.star).toBe(true);
    expect(hints[5]?.noBarre).toBe(true);
  });

  test('a song without chords: no stars', () => {
    expect(capoHints(parse('просто текст').doc, STANDARD, 0).some((hint) => hint.star)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `cd packages/audio && bun test src/capo-hints.test.ts` → FAIL.

- [ ] **Step 3: Write `capo-hints.ts`**

```ts
import { chordList, type SongDoc, spellingOf, transposeChord } from '@chordtune/chord-sheet';

import { voicingsFor } from './voicing';

export const MAX_HINT_CAPO = 7;
const MISSING_SHAPE_COST = 10;
const SECOND_STAR_MARGIN = 1;

export type CapoHint = {
  capo: number;
  /** Sum of the easiest shape's cost over the song's chords at this capo. */
  cost: number;
  barres: number;
  star: boolean;
  noBarre: boolean;
};

/** How easy the song's chords are at each capo fret 0–7; ★ on the easiest one or two. */
export function capoHints(
  doc: SongDoc,
  strings: readonly number[],
  authorCapo: number,
): CapoHint[] {
  const chords = chordList(doc);
  const spelling = spellingOf(doc);
  const hints = Array.from({ length: MAX_HINT_CAPO + 1 }, (_, capo) => {
    let cost = 0;
    let barres = 0;
    for (const chord of chords) {
      const shape = voicingsFor(transposeChord(chord, authorCapo - capo, spelling), strings)[0];
      cost += shape ? shape.cost : MISSING_SHAPE_COST;
      barres += shape?.barre ? 1 : 0;
    }
    return { capo, cost, barres, star: false, noBarre: chords.length > 0 && barres === 0 };
  });
  if (chords.length === 0) {
    return hints;
  }
  const ranked = [...hints].sort((a, b) => a.cost - b.cost);
  const [best, second] = ranked;
  if (best) {
    best.star = true;
  }
  if (best && second && second.cost <= best.cost + SECOND_STAR_MARGIN) {
    second.star = true;
  }
  return hints;
}
```

Add `export * from './capo-hints';` to `packages/audio/src/index.ts`.

- [ ] **Step 4: Run tests** — `cd packages/audio && bun test` → PASS; root types/lint clean.

- [ ] **Step 5: Commit**

```bash
git add packages/audio/src
git commit -m "Score capo positions for a song

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The listener's capo on the song page

**Files:**
- Create: `apps/web/src/features/song/song-settings.ts`
- Create: `apps/web/src/features/song/song-settings.test.ts`
- Create: `apps/web/src/features/song/capo-picker.tsx`
- Modify: `apps/web/src/features/song/song-view.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `withCapo`, `countUnreachable`, `isZenMode`, `ZenModeId` (chord-sheet); `capoHints`, `CapoHint` (audio); `SongSound`, `songSound` (playback).
- Produces:
  - `type SongSettings = { capo: number | null; zenMode: ZenModeId | null }`, `songSettingsKey(id: string): string`, `readSongSettings(raw: string | null): SongSettings`, `useSongSettings(id: string): readonly [SongSettings, (patch: Partial<SongSettings>) => void]`.
  - `<CapoPicker value: number authorCapo: number hints: () => CapoHint[] onChange: (capo: number | null) => void />`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/song/song-settings.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { readSongSettings, songSettingsKey } from './song-settings';

describe('readSongSettings', () => {
  test('valid values', () => {
    expect(readSongSettings('{"capo":3,"zenMode":"strip"}')).toEqual({ capo: 3, zenMode: 'strip' });
    expect(readSongSettings('{"capo":0,"zenMode":null}')).toEqual({ capo: 0, zenMode: null });
  });

  test('missing, broken or invalid values read as null', () => {
    expect(readSongSettings(null)).toEqual({ capo: null, zenMode: null });
    expect(readSongSettings('{oops')).toEqual({ capo: null, zenMode: null });
    expect(readSongSettings('{"capo":13,"zenMode":"auto"}')).toEqual({ capo: null, zenMode: null });
    expect(readSongSettings('{"capo":2.5}')).toEqual({ capo: null, zenMode: null });
    expect(readSongSettings('[1]')).toEqual({ capo: null, zenMode: null });
  });

  test('key per arrangement', () => {
    expect(songSettingsKey('abc')).toBe('chordtune.song.abc');
  });
});
```

- [ ] **Step 2: Run it to verify it fails** — `cd apps/web && bun test src/features/song/song-settings.test.ts` → FAIL.

- [ ] **Step 3: Write `song-settings.ts`**

```ts
'use client';

import { isZenMode, type ZenModeId } from '@chordtune/chord-sheet';
import { useCallback, useEffect, useState } from 'react';

const MAX_CAPO = 12;

/** The listener's choices for one song, kept on this device. `null` means «as the author». */
export type SongSettings = { capo: number | null; zenMode: ZenModeId | null };

const EMPTY: SongSettings = { capo: null, zenMode: null };

export const songSettingsKey = (id: string) => `chordtune.song.${id}`;

export function readSongSettings(raw: string | null): SongSettings {
  if (!raw) {
    return EMPTY;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return EMPTY;
    }
    const { capo, zenMode } = data as Record<string, unknown>;
    return {
      capo: Number.isInteger(capo) && (capo as number) >= 0 && (capo as number) <= MAX_CAPO ? (capo as number) : null,
      zenMode: isZenMode(zenMode) ? zenMode : null,
    };
  } catch {
    return EMPTY;
  }
}

/** Starts empty so the prerendered HTML matches, then loads the saved choice. */
export function useSongSettings(id: string) {
  const [settings, setSettings] = useState<SongSettings>(EMPTY);

  useEffect(() => {
    try {
      setSettings(readSongSettings(localStorage.getItem(songSettingsKey(id))));
    } catch {
      setSettings(EMPTY);
    }
  }, [id]);

  const update = useCallback(
    (patch: Partial<SongSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        try {
          localStorage.setItem(songSettingsKey(id), JSON.stringify(next));
        } catch {
          // storage can be unavailable in private mode
        }
        return next;
      });
    },
    [id],
  );

  return [settings, update] as const;
}
```

- [ ] **Step 4: Write `capo-picker.tsx`**

```tsx
'use client';

import type { CapoHint } from '@chordtune/audio';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const FRETS = Array.from({ length: 13 }, (_, fret) => fret);

/** «Каподастр: 3 лад ▾» — the listener's capo, with ★ on easy frets and «как у автора». */
export function CapoPicker({
  value,
  authorCapo,
  hints,
  onChange,
}: {
  value: number;
  authorCapo: number;
  /** Computed when the list opens: it runs the voicing search for every fret. */
  hints: () => CapoHint[];
  onChange: (capo: number | null) => void;
}) {
  const t = useTranslations('song');
  const label = value === 0 ? t('capoNone') : t('capo', { fret: value });
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1 rounded-md',
          value !== authorCapo && 'font-semibold text-chord',
        )}
      >
        {label}
        <ChevronDown className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0.5 p-1.5">
        <CapoList value={value} authorCapo={authorCapo} hints={hints} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

function CapoList({
  value,
  authorCapo,
  hints,
  onChange,
}: {
  value: number;
  authorCapo: number;
  hints: () => CapoHint[];
  onChange: (capo: number | null) => void;
}) {
  const t = useTranslations('song');
  const byFret = new Map(hints().map((hint) => [hint.capo, hint]));
  return (
    <>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-surface-2"
      >
        {t('capoAsAuthor')}
      </button>
      {FRETS.map((fret) => {
        const hint = byFret.get(fret);
        return (
          <button
            key={fret}
            type="button"
            aria-pressed={fret === value}
            onClick={() => onChange(fret)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            <span className="w-4">{fret === value && <Check className="size-3.5" />}</span>
            <span className="flex-1">{fret === 0 ? t('capoNone') : t('capoFret', { fret })}</span>
            {fret === authorCapo && <span className="text-muted-foreground text-xs">{t('capoAuthor')}</span>}
            {hint?.noBarre && <span className="text-muted-foreground text-xs">{t('noBarre')}</span>}
            {hint?.star && <span className="text-chord">★</span>}
          </button>
        );
      })}
    </>
  );
}
```

- [ ] **Step 5: Wire it into `song-view.tsx`**

Imports: `countUnreachable, withCapo` from chord-sheet; `capoHints` from `@chordtune/audio`; `CapoPicker` from `./capo-picker`; `useSongSettings` from `./song-settings`.

Inside `SongView`, after `const sound = …`:

```ts
  const [settings, updateSettings] = useSongSettings(arrangement.id);
  const authorCapo = arrangement.capo ?? 0;
  const capo = preview ? authorCapo : (settings.capo ?? authorCapo);
  const view = useMemo(
    () => withCapo(doc, sound.tuning.strings, authorCapo, capo).doc,
    [doc, sound.tuning.strings, authorCapo, capo],
  );
  // The author's shapes only fit their own capo.
  const viewSound = useMemo(
    () => ({ ...sound, capo, voicings: capo === authorCapo ? sound.voicings : {} }),
    [sound, capo, authorCapo],
  );
```

Then use `view` instead of `doc` and `viewSound` instead of `sound` everywhere below in the component: `chordList(view)`, `useChordBrowser(chords, viewSound)`, `shapePlayback(shape, viewSound)`, the `options`/`opts` objects (`{ bpm, speed, ...viewSound }`), `playing`, `canPlay`, `firstChord(view)`, the section/line rendering (`view.sections.map`), `listenHint` (`view.sections[…]`), and `<ZenMode doc={view} …>`.

The details line: replace the capo span with

```tsx
          {preview ? (
            arrangement.capo ? <span>{t('capo', { fret: arrangement.capo })}</span> : null
          ) : (
            <CapoPicker
              value={capo}
              authorCapo={authorCapo}
              hints={() => capoHints(doc, sound.tuning.strings, authorCapo)}
              onChange={(next) => {
                player.stop();
                updateSettings({ capo: next });
              }}
            />
          )}
```

Above an alphaTex `TabStaff`, when the block has unreachable notes:

```tsx
              if (line.type === 'alphatex') {
                const lost = countUnreachable(line.block);
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  <div key={lineIndex} className="flex flex-col gap-1">
                    {lost > 0 && (
                      <p className="rounded-md bg-destructive/10 px-2 py-1 text-destructive text-xs">
                        {t('unreachable', { count: lost, fret: capo })}
                      </p>
                    )}
                    <TabStaff block={line.block} activeBeat={here ? active.beat : null} className="py-1" />
                  </div>
                );
              }
```

Above an ASCII `TabView` when `capo !== authorCapo`:

```tsx
              if (line.type === 'tab') {
                return (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional
                  <div key={lineIndex} className="flex flex-col gap-1">
                    {capo !== authorCapo && (
                      <p className="text-muted-foreground text-xs">{t('asciiTabCapo', { fret: authorCapo })}</p>
                    )}
                    <TabView lines={line.lines} />
                  </div>
                );
              }
```

- [ ] **Step 6: Copy**

`ru.json` → `"song"` add:

```json
    "capoNone": "Без каподастра",
    "capoFret": "{fret} лад",
    "capoAuthor": "у автора",
    "capoAsAuthor": "Как у автора",
    "noBarre": "без баррэ",
    "unreachable": "{count, plural, one {# ноту} few {# ноты} many {# нот} other {# ноты}} не сыграть с каподастром на {fret}-м ладу",
    "asciiTabCapo": "{fret, plural, =0 {Таб для игры без каподастра} other {Таб для каподастра на {fret}-м ладу}}"
```

`en.json` → `"song"` add:

```json
    "capoNone": "No capo",
    "capoFret": "Fret {fret}",
    "capoAuthor": "author's",
    "capoAsAuthor": "As the author",
    "noBarre": "no barre",
    "unreachable": "{count, plural, one {# note} other {# notes}} can't be played with a capo on fret {fret}",
    "asciiTabCapo": "{fret, plural, =0 {Tab for playing without a capo} other {Tab for a capo on fret {fret}}}"
```

- [ ] **Step 7: Run tests, types, lint** — `cd apps/web && bun test src` → PASS; root types/lint clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "Let listeners pick a capo and recalculate the song for it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Capo hints and «Пересчитать» in the editor

**Files:**
- Modify: `apps/web/src/features/editor/song-meta.tsx`
- Modify: `apps/web/src/features/editor/song-form.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `withCapo`, `chordList` (chord-sheet); `capoHints`, `CapoHint` (audio).
- Produces: `SongMetaSheet` props gain `capoHints: CapoHint[] | null`, `pendingCapo: { to: number; blocked: number } | null`, `onCapoPick: (capo: number | null) => void`, `onRecalculate: () => void`, `onKeepWritten: () => void`; the capo `Select` no longer calls `onChange({ capo })` directly.

- [ ] **Step 1: `song-form.tsx`**

```ts
  const [pendingCapo, setPendingCapo] = useState<{
    to: number;
    result: ReturnType<typeof withCapo>;
  } | null>(null);
  const hints = useMemo(
    () => (metaOpen ? capoHints(doc, sound.tuning.strings, fields.capo ?? 0) : null),
    [metaOpen, doc, sound.tuning.strings, fields.capo],
  );

  const hasMusic = (song: SongDoc) =>
    chordList(song).length > 0 ||
    song.sections.some((section) => section.lines.some((line) => line.type === 'alphatex'));

  const pickCapo = (next: number | null) => {
    const from = fields.capo ?? 0;
    const to = next ?? 0;
    if (to === from) {
      setPendingCapo(null);
      return;
    }
    if (!hasMusic(doc)) {
      update({ capo: to || null });
      return;
    }
    setPendingCapo({ to, result: withCapo(doc, sound.tuning.strings, from, to) });
  };

  const recalculate = () => {
    if (!pendingCapo) {
      return;
    }
    replaceDoc(pendingCapo.result.doc);
    if (Object.keys(fields.voicings).length > 0) {
      toast(t('voicingsResetCapo'));
    }
    update({ capo: pendingCapo.to || null, voicings: {} });
    setPendingCapo(null);
  };

  const keepWritten = () => {
    if (pendingCapo) {
      update({ capo: pendingCapo.to || null });
    }
    setPendingCapo(null);
  };
```

Pass to the sheet:

```tsx
      <SongMetaSheet
        open={metaOpen}
        onOpenChange={(open) => {
          setMetaOpen(open);
          if (!open) {
            setPendingCapo(null);
          }
        }}
        fields={fields}
        onChange={update}
        capoHints={hints}
        pendingCapo={
          pendingCapo
            ? { to: pendingCapo.to, blocked: pendingCapo.result.unreachable + pendingCapo.result.stale }
            : null
        }
        onCapoPick={pickCapo}
        onRecalculate={recalculate}
        onKeepWritten={keepWritten}
        artistId={artistId}
        onArtistMatch={setArtistId}
      />
```

Imports: `capoHints` from `@chordtune/audio`; `withCapo`, `type SongDoc` from chord-sheet.

- [ ] **Step 2: `song-meta.tsx`**

New props on `SongMetaSheet` (see Interfaces). The capo items show the hints:

```ts
  const capoItems = CAPO_FRETS.map((fret) => {
    const hint = capoHints?.find((item) => item.capo === fret);
    const base = fret === 0 ? t('noCapo') : String(fret);
    const tags = [hint?.star ? '★' : null, hint?.noBarre ? t('noBarre') : null].filter(Boolean);
    return { value: String(fret), label: tags.length > 0 ? `${base} · ${tags.join(' · ')}` : base };
  });
```

The capo `Select` uses `value={String(pendingCapo?.to ?? fields.capo ?? 0)}` and `onValueChange={(value) => onCapoPick(Number(value) || null)}`.

Under the grid of fields, when `pendingCapo` is set:

```tsx
          {pendingCapo && (
            <div className="flex flex-col gap-2 rounded-2xl border border-chord/40 bg-chord/5 p-3 text-sm">
              <p>{t('recalcCapo', { fret: pendingCapo.to })}</p>
              {pendingCapo.blocked > 0 && (
                <p className="text-destructive text-xs">{t('recalcBlocked', { count: pendingCapo.blocked })}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={pendingCapo.blocked > 0} onClick={onRecalculate}>
                  {t('recalc')}
                </Button>
                <Button size="sm" variant="outline" onClick={onKeepWritten}>
                  {t('keepWritten')}
                </Button>
              </div>
            </div>
          )}
```

(`Button` from `@/components/ui/button`.)

- [ ] **Step 3: Copy**

`ru.json` → `"editor"` add:

```json
    "noBarre": "без баррэ",
    "recalcCapo": "Пересчитать аккорды и табы {fret, plural, =0 {для игры без каподастра} other {под каподастр на {fret}-м ладу}}? Звучание не изменится.",
    "recalc": "Пересчитать",
    "keepWritten": "Оставить как написано",
    "recalcBlocked": "{count, plural, one {# нота таба не помещается} few {# ноты таба не помещаются} many {# нот таба не помещаются} other {# ноты таба не помещаются}} — пересчитать нельзя",
    "voicingsResetCapo": "Аккорды пересчитаны, аппликатуры сброшены"
```

`en.json` → `"editor"` add:

```json
    "noBarre": "no barre",
    "recalcCapo": "Recalculate chords and tabs {fret, plural, =0 {for playing without a capo} other {for a capo on fret {fret}}}? The sound stays the same.",
    "recalc": "Recalculate",
    "keepWritten": "Keep as written",
    "recalcBlocked": "{count, plural, one {# tab note doesn't fit} other {# tab notes don't fit}} — can't recalculate",
    "voicingsResetCapo": "Chords recalculated, shapes cleared"
```

(The `recalcBlocked` count also covers alphaTex blocks with errors, which cannot be rewritten; the wording stays «нота не помещается» on purpose — a broken block shows its own error in the editor.)

- [ ] **Step 4: Run tests, types, lint** — `cd apps/web && bun test src` → PASS; root types/lint clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Show capo hints and offer recalculation in the editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
