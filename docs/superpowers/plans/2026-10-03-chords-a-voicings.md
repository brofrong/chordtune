# Stage A — Song Tuning, Voicings and the Chord Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A song has a guitar tuning; every chord has several shapes (voicings) found for that tuning; the song page shows chord diagrams in a panel (desktop column on the right, phone strip, popover on tap); the author picks or draws shapes in the editor.

**Architecture:** `packages/chord-sheet` gets the song tunings (`tuning.ts`), shape helpers (`shape.ts`), zen mode ids (`display.ts`) and a chord namer (`chord-name.ts`). `packages/audio` gets a multi-shape voicing search for any tuning (`voicing.ts`), open strings in the schedulers and `strumShape`. The API stores `tuning`, `voicings` and `zen_mode` on `arrangement`. The web app threads a `SongSound` (`capo`, `tuning`, `voicings`) through playback, adds `features/chords/` (diagram, fretboard, card, panel, voicing sheet) and wires them into the song page and the editor.

**Tech Stack:** TypeScript 6, Bun test, React 19 / Next 16, Tailwind v4, next-intl, base-ui (`@/components/ui/*`), Drizzle ORM 1.0 rc + drizzle-kit, zod 4, Biome.

**Spec:** `docs/superpowers/specs/2026-10-03-chords-capo-zen-design.md` (sections 1–7 are this stage).

## Global Constraints

- Song tunings are the guitar tunings `standard`, `drop-d`, `half-step-down`, `d-standard`, `drop-c`, `open-g`, `open-d`, `dadgad`; default `standard`.
- `half-step-down` → `standard` shapes, sound shift −1; `d-standard` → `standard`, −2; `drop-c` → `drop-d`, −2; every other tuning plays its own strings with shift 0.
- Sound: `midi = strings[i] + fret + capo + shift`.
- A shape (`Shape`) is frets from the thickest string to the thinnest, `null` = not sounding, each fret an integer 0–24, at least one sounding string, length = number of strings (6 for a song).
- Voicing search: frets 0–12 windows, hand span 3 frets, at most 4 fingers (a barre counts as one), at least `min(4, strings − 1)` sounding strings; in a re-entrant tuning (a string lower than the one before it, e.g. ukulele GCEA) the bass is not checked.
- The catalog shape (`CHORD_CATALOG`) comes first only in standard tuning and only for chords without a slash bass.
- `voicings` keys are chords normalised like `chordList` (`Hm` → `Bm`); at most 64 entries; the server drops keys whose chord is not in the song.
- Panel visibility is one device setting for all songs: `localStorage['chordtune.chords.panel']` = `'open' | 'hidden'`, default open.
- Changing the tuning in the editor clears the author's voicings (toast); it does not touch chords or tabs.
- UI copy in `apps/web/messages/ru.json` and `en.json`; UI is verified by the user by hand (no screenshots).
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Commands: package tests `cd packages/<pkg> && bun test <file>`; API tests `cd apps/api && bun test <file>`; web tests `cd apps/web && bun test <file>`; types `bunx turbo run check-types`; lint `bun run lint`; formatting `bun run format` — all from the repo root unless a `cd` is shown.

## Review Focus

1. A song saved before this stage (no `tuning`/`voicings`/`zenMode` in an offline copy) still opens and plays in standard tuning (Task 5 `withSongDefaults` test).
2. A chord with no playable shape (e.g. a rare chord in an open tuning) shows «нет аппликатуры» and the song still plays without it (Task 3 `voicingsFor` returns `[]` for non-chords; Task 7 card renders the empty state).
3. A tuned-down song (`half-step-down`) sounds a semitone lower than the same song in standard (Task 5 playback test).
4. Drawing a shape that is not the chord still saves, with a «sounds like» hint (Task 2 `playsChord` false case; Task 8 sheet).
5. Voicings for chords removed from the song are not stored (Task 4 prune test).

---

### Task 1: Song tunings, shapes and zen mode ids in `chord-sheet`

**Files:**
- Create: `packages/chord-sheet/src/tuning.ts`
- Create: `packages/chord-sheet/src/tuning.test.ts`
- Create: `packages/chord-sheet/src/shape.ts`
- Create: `packages/chord-sheet/src/shape.test.ts`
- Create: `packages/chord-sheet/src/display.ts`
- Modify: `packages/chord-sheet/src/extract.ts` (`chordList` uses `chordKey`)
- Modify: `packages/chord-sheet/src/index.ts`
- Modify: `packages/audio/src/tunings.ts` (guitar tunings from `GUITAR_TUNINGS`)
- Modify: `packages/audio/src/tunings.test.ts`

**Interfaces:**
- Produces (chord-sheet):
  - `GUITAR_TUNINGS: { standard: readonly number[]; 'drop-d': …; … }`, `type SongTuningId`, `SONG_TUNING_IDS: SongTuningId[]`, `isSongTuningId(value: unknown): value is SongTuningId`.
  - `type SongTuning = { id: SongTuningId; strings: readonly number[]; shift: number }`, `songTuning(id: string | null | undefined): SongTuning`.
  - `isReentrant(strings: readonly number[]): boolean`.
  - `type Shape = (number | null)[]`, `type Voicings = Record<string, Shape>`, `MAX_SHAPE_FRET = 24`, `chordKey(raw: string): string | null`, `isShape(value: unknown, stringCount: number): value is Shape`, `sanitizeVoicings(value: unknown, stringCount: number): Voicings`, `shapeMidis(shape: readonly (number | null)[], strings: readonly number[], capo?: number): number[]`.
  - `ZEN_MODES = ['inline', 'strip'] as const`, `type ZenModeId`, `isZenMode(value: unknown): value is ZenModeId`.

- [ ] **Step 1: Write the failing tests**

`packages/chord-sheet/src/tuning.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { GUITAR_TUNINGS, isReentrant, isSongTuningId, SONG_TUNING_IDS, songTuning } from './tuning';

describe('songTuning', () => {
  test('tuned-down tunings play the shapes of another, lower', () => {
    expect(songTuning('half-step-down')).toEqual({
      id: 'half-step-down',
      strings: GUITAR_TUNINGS.standard,
      shift: -1,
    });
    expect(songTuning('d-standard')).toMatchObject({ strings: GUITAR_TUNINGS.standard, shift: -2 });
    expect(songTuning('drop-c')).toMatchObject({ strings: GUITAR_TUNINGS['drop-d'], shift: -2 });
  });

  test('other tunings play their own strings', () => {
    expect(songTuning('open-g')).toEqual({ id: 'open-g', strings: GUITAR_TUNINGS['open-g'], shift: 0 });
    expect(songTuning('standard').shift).toBe(0);
  });

  test('strings plus shift are the real open strings', () => {
    for (const id of SONG_TUNING_IDS) {
      const { strings, shift } = songTuning(id);
      expect(strings.map((midi) => midi + shift), id).toEqual([...GUITAR_TUNINGS[id]]);
    }
  });

  test('unknown or missing ids are standard', () => {
    expect(songTuning('banjo').id).toBe('standard');
    expect(songTuning(null).id).toBe('standard');
    expect(songTuning(undefined).id).toBe('standard');
    expect(isSongTuningId('dadgad')).toBe(true);
    expect(isSongTuningId('toString')).toBe(false);
  });
});

describe('isReentrant', () => {
  test('a string lower than the one before it', () => {
    expect(isReentrant([67, 60, 64, 69])).toBe(true);
    expect(isReentrant([55, 60, 64, 69])).toBe(false);
    expect(isReentrant(GUITAR_TUNINGS.standard)).toBe(false);
  });
});
```

`packages/chord-sheet/src/shape.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { isZenMode } from './display';
import { chordKey, isShape, sanitizeVoicings, shapeMidis } from './shape';

describe('chordKey', () => {
  test('normalises like chordList', () => {
    expect(chordKey('Hm')).toBe('Bm');
    expect(chordKey('F#m7/C#')).toBe('F#m7/C#');
    expect(chordKey('Куплет')).toBeNull();
  });
});

describe('isShape', () => {
  test('frets per string, 0–24 or null, something sounds', () => {
    expect(isShape([null, 0, 2, 2, 1, 0], 6)).toBe(true);
    expect(isShape([null, 0, 2, 2, 1], 6)).toBe(false);
    expect(isShape([null, 0, 2, 2, 1, 25], 6)).toBe(false);
    expect(isShape([null, 0, 2, 2, 1, 1.5], 6)).toBe(false);
    expect(isShape([null, null, null, null, null, null], 6)).toBe(false);
    expect(isShape('x02210', 6)).toBe(false);
  });
});

describe('sanitizeVoicings', () => {
  test('keeps normalised chords with valid shapes', () => {
    expect(
      sanitizeVoicings(
        {
          Am: [null, 0, 2, 2, 1, 0],
          Hm: [null, 2, 4, 4, 3, 2],
          F: [1, 3, 3],
          Нет: [0, 0, 0, 0, 0, 0],
        },
        6,
      ),
    ).toEqual({ Am: [null, 0, 2, 2, 1, 0] });
    expect(sanitizeVoicings(null, 6)).toEqual({});
    expect(sanitizeVoicings([[0]], 6)).toEqual({});
  });
});

describe('shapeMidis', () => {
  test('sounding strings, thickest first, plus capo', () => {
    expect(shapeMidis([null, 0, 2, 2, 1, 0], [40, 45, 50, 55, 59, 64])).toEqual([45, 52, 57, 60, 64]);
    expect(shapeMidis([0, null, null, null, null, null], [40, 45, 50, 55, 59, 64], 3)).toEqual([43]);
  });
});

describe('isZenMode', () => {
  test('inline and strip', () => {
    expect(isZenMode('inline')).toBe(true);
    expect(isZenMode('strip')).toBe(true);
    expect(isZenMode('auto')).toBe(false);
    expect(isZenMode(null)).toBe(false);
  });
});
```

Append to `packages/audio/src/tunings.test.ts` (inside the file, after the existing imports add `import { SONG_TUNING_IDS } from '@chordtune/chord-sheet';` and `INSTRUMENTS` to the `./tunings` import if it is not imported yet):

```ts
test('guitar tunings are the song tunings', () => {
  const guitar = INSTRUMENTS.find((instrument) => instrument.id === 'guitar');
  expect(guitar?.tunings.map((tuning) => tuning.id)).toEqual(SONG_TUNING_IDS);
  expect(guitar?.tunings[0]?.strings).toEqual([40, 45, 50, 55, 59, 64]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/chord-sheet && bun test src/tuning.test.ts src/shape.test.ts`
Expected: FAIL — modules `./tuning`, `./shape`, `./display` not found.

- [ ] **Step 3: Write `tuning.ts`**

```ts
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
```

- [ ] **Step 4: Write `shape.ts` and `display.ts`**

`packages/chord-sheet/src/shape.ts`:

```ts
import { parseChord } from './chord';

/** Frets of a chord shape, thickest string first; `null` is a string that does not sound. */
export type Shape = (number | null)[];

/** The author's shapes, keyed by `chordKey`. */
export type Voicings = Record<string, Shape>;

export const MAX_SHAPE_FRET = 24;

/** `Hm` → `Bm`, `F#m7/C#` as is; null when it is not a chord. Chords are keyed by it song-wide. */
export function chordKey(raw: string): string | null {
  const chord = parseChord(raw);
  return chord ? `${chord.root}${chord.suffix}${chord.bass ? `/${chord.bass}` : ''}` : null;
}

export function isShape(value: unknown, stringCount: number): value is Shape {
  return (
    Array.isArray(value) &&
    value.length === stringCount &&
    value.every(
      (fret) =>
        fret === null || (Number.isInteger(fret) && fret >= 0 && fret <= MAX_SHAPE_FRET),
    ) &&
    value.some((fret) => fret !== null)
  );
}

/** Keeps the entries keyed by a normalised chord with a valid shape. */
export function sanitizeVoicings(value: unknown, stringCount: number): Voicings {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      ([chord, shape]) => chordKey(chord) === chord && isShape(shape, stringCount),
    ),
  ) as Voicings;
}

/** MIDI notes a shape sounds, thickest string first. */
export function shapeMidis(
  shape: readonly (number | null)[],
  strings: readonly number[],
  capo = 0,
): number[] {
  return shape.flatMap((fret, i) => (fret === null ? [] : [(strings[i] ?? 0) + fret + capo]));
}
```

`packages/chord-sheet/src/display.ts`:

```ts
/** How zen mode shows chords: above the words, or as a fixed strip with the words alone. */
export const ZEN_MODES = ['inline', 'strip'] as const;

export type ZenModeId = (typeof ZEN_MODES)[number];

export function isZenMode(value: unknown): value is ZenModeId {
  return typeof value === 'string' && (ZEN_MODES as readonly string[]).includes(value);
}
```

- [ ] **Step 5: `chordList` through `chordKey`, exports**

In `packages/chord-sheet/src/extract.ts` replace the import of `parseChord` with `import { chordKey } from './shape';` and the inner loop of `chordList` with:

```ts
      for (const item of line.items) {
        const key = item.type === 'chord' ? chordKey(item.chord) : null;
        if (key) {
          chords.add(key);
        }
      }
```

In `packages/chord-sheet/src/index.ts` add (keep alphabetical order):

```ts
export * from './display';
export * from './shape';
export * from './tuning';
```

- [ ] **Step 6: Guitar tunings in `packages/audio/src/tunings.ts`**

Add `import { GUITAR_TUNINGS, SONG_TUNING_IDS } from '@chordtune/chord-sheet';` at the top and replace the eight `tuning('guitar', …)` lines of the guitar instrument with:

```ts
    tunings: SONG_TUNING_IDS.map((id) => tuning('guitar', id, [...GUITAR_TUNINGS[id]])),
```

- [ ] **Step 7: Run tests and types**

Run: `cd packages/chord-sheet && bun test` → all PASS. `cd packages/audio && bun test src/tunings.test.ts` → PASS. `bunx turbo run check-types` → no errors. `bun run lint` → clean.

- [ ] **Step 8: Commit**

```bash
git add packages/chord-sheet/src packages/audio/src/tunings.ts packages/audio/src/tunings.test.ts
git commit -m "Add song tunings, chord shapes and zen mode ids

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Chord names from notes (`chord-name.ts`)

**Files:**
- Create: `packages/chord-sheet/src/chord-name.ts`
- Create: `packages/chord-sheet/src/chord-name.test.ts`
- Modify: `packages/chord-sheet/src/index.ts`

**Interfaces:**
- Consumes: `parseChord`, `chordTones` (`chord.ts`).
- Produces: `NOTE_NAMES` (12 names, C = 0, `Eb`/`Bb` flats, other black keys sharp), `CHORD_SUFFIXES: string[]` (the namer's qualities, simplest first), `nameChord(midis: readonly number[], options?: { ignoreBass?: boolean }): string[]`, `playsChord(midis: readonly number[], raw: string, options?: { ignoreBass?: boolean }): boolean`, `noteName(midi: number): string`.

- [ ] **Step 1: Write the failing tests**

`packages/chord-sheet/src/chord-name.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { chordTones, parseChord } from './chord';
import { CHORD_SUFFIXES, NOTE_NAMES, nameChord, noteName, playsChord } from './chord-name';

const AM_OPEN = [45, 52, 57, 60, 64]; // x02210

describe('nameChord', () => {
  test('every root and quality names itself first in root position', () => {
    NOTE_NAMES.forEach((name, root) => {
      for (const suffix of CHORD_SUFFIXES) {
        const chord = parseChord(name + suffix);
        expect(chord, name + suffix).not.toBeNull();
        if (!chord) {
          continue;
        }
        const midis = chordTones(chord).intervals.map((interval) => 48 + root + interval);
        expect(nameChord(midis)[0], name + suffix).toBe(name + suffix);
      }
    });
  });

  test('alternatives: x02210 is Am, then C6/A among others', () => {
    const names = nameChord(AM_OPEN);
    expect(names[0]).toBe('Am');
    expect(names).toContain('C6/A');
  });

  test('a bass that is not the root makes a slash chord', () => {
    expect(nameChord([42, 50, 57, 62, 66])[0]).toBe('D/F#'); // 2x0232
  });

  test('ignoreBass: no slash chords for a re-entrant ukulele', () => {
    const am = [69, 60, 64, 69]; // GCEA 2000: the lowest note is the C string
    expect(nameChord(am)).toContain('Am/C');
    expect(nameChord(am)).not.toContain('Am');
    expect(nameChord(am, { ignoreBass: true })[0]).toBe('Am');
  });

  test('a fifth on its own is a power chord; one note or nothing known is empty', () => {
    expect(nameChord([40, 47])).toEqual(['E5']);
    expect(nameChord([40, 52])).toEqual([]);
    expect(nameChord([40, 41])).toEqual([]);
    expect(nameChord([])).toEqual([]);
  });
});

describe('playsChord', () => {
  test('all notes belong, all tones but an optional fifth are there, bass is right', () => {
    expect(playsChord(AM_OPEN, 'Am')).toBe(true);
    expect(playsChord(AM_OPEN, 'C')).toBe(false);
    expect(playsChord([45, 52, 57, 61, 64], 'Am')).toBe(false); // x02220 is A
    expect(playsChord([42, 50, 57, 62, 66], 'D/F#')).toBe(true);
    expect(playsChord([42, 50, 57, 62, 66], 'D')).toBe(false);
    expect(playsChord([47, 54, 59, 62, 66], 'Hm')).toBe(true);
    expect(playsChord([43, 47, 53, 59], 'G7')).toBe(true); // no fifth in a four-note chord
    expect(playsChord([69, 60, 64, 69], 'Am', { ignoreBass: true })).toBe(true);
    expect(playsChord([], 'Am')).toBe(false);
    expect(playsChord(AM_OPEN, 'Куплет')).toBe(false);
  });
});

describe('noteName', () => {
  test('pitch class names', () => {
    expect(noteName(40)).toBe('E');
    expect(noteName(58)).toBe('Bb');
    expect(noteName(61)).toBe('C#');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/chord-sheet && bun test src/chord-name.test.ts`
Expected: FAIL — module `./chord-name` not found.

- [ ] **Step 3: Write `chord-name.ts`**

```ts
import { chordTones, parseChord } from './chord';

/** Pitch class names, C = 0, with the flats guitarists usually read. */
export const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'] as const;

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

const NO_FIFTH_PENALTY = 10;
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
```

Add `export * from './chord-name';` to `packages/chord-sheet/src/index.ts`.

- [ ] **Step 4: Run tests**

Run: `cd packages/chord-sheet && bun test src/chord-name.test.ts` → PASS; then `bun test` (package) → PASS; `bunx turbo run check-types` and `bun run lint` from the root → clean.

- [ ] **Step 5: Commit**

```bash
git add packages/chord-sheet/src
git commit -m "Name chords from notes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Voicings for any tuning, `strumShape`, open strings in the schedulers

**Files:**
- Modify: `packages/audio/src/voicing.ts` (rewrite)
- Modify: `packages/audio/src/voicing.test.ts`
- Modify: `packages/audio/src/strum-schedule.ts`
- Modify: `packages/audio/src/strum-schedule.test.ts`
- Modify: `packages/audio/src/tab-schedule.ts`
- Modify: `packages/audio/src/tab-schedule.test.ts`

**Interfaces:**
- Consumes: `isReentrant`, `GUITAR_TUNINGS`, `shapeMidis`, `playsChord` (Tasks 1–2).
- Produces:
  - `type Voicing = { frets: GuitarFrets; cost: number; barre: boolean }`.
  - `voicingsFor(raw: string, strings?: readonly number[], options?: { limit?: number }): Voicing[]` (default strings `OPEN_STRING_MIDI`, limit 8).
  - `voicingFor(raw: string, strings?: readonly number[]): GuitarFrets | null`.
  - `type Barre = { fret: number; from: number; to: number }` (`from`/`to` are string indices, thickest = 0), `barreOf(frets: GuitarFrets): Barre | null`.
  - `strumShape(frets: GuitarFrets, strings?: readonly number[], capo?: number): ScheduledNote[]`.
  - `ScheduleOptions` gains `strings?: readonly number[]`; `scheduleTab(block, { bpm, capo?, strings? })`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/audio/src/voicing.test.ts` (extend imports: `import { GUITAR_TUNINGS, playsChord, shapeMidis } from '@chordtune/chord-sheet';` and `import { barreOf, voicingFor, voicingsFor } from './voicing';`):

```ts
const UKULELE = [67, 60, 64, 69];

const lowestFretted = (frets: readonly (number | null)[]) => {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  return frets.includes(0) || fretted.length === 0 ? 0 : Math.min(...fretted);
};

describe('voicingsFor', () => {
  test('several distinct shapes in different places on the neck', () => {
    const shapes = voicingsFor('G');
    expect(shapes[0]?.frets).toEqual([3, 2, 0, 0, 0, 3]);
    expect(shapes.length).toBeGreaterThanOrEqual(4);
    expect(shapes.length).toBeLessThanOrEqual(8);
    expect(new Set(shapes.map((shape) => shape.frets.join())).size).toBe(shapes.length);
    expect(new Set(shapes.slice(0, 4).map((shape) => lowestFretted(shape.frets))).size).toBe(4);
  });

  test('limit', () => {
    expect(voicingsFor('C', undefined, { limit: 3 })).toHaveLength(3);
  });

  test('every shape plays the chord in other tunings', () => {
    for (const id of ['drop-d', 'open-g', 'dadgad'] as const) {
      const strings = GUITAR_TUNINGS[id];
      for (const raw of ['C', 'D', 'G', 'Am', 'Em']) {
        const shapes = voicingsFor(raw, strings);
        expect(shapes.length, `${raw} in ${id}`).toBeGreaterThan(0);
        for (const { frets } of shapes) {
          expect(playsChord(shapeMidis(frets, strings), raw), `${raw} ${frets} in ${id}`).toBe(true);
        }
      }
    }
  });

  test('ukulele: re-entrant, the bass is not checked', () => {
    expect(voicingsFor('C', UKULELE)[0]?.frets).toEqual([0, 0, 0, 3]);
    expect(voicingsFor('Am', UKULELE)[0]?.frets).toEqual([2, 0, 0, 0]);
    expect(voicingsFor('F', UKULELE)[0]?.frets).toEqual([2, 0, 1, 0]);
  });

  test('voicingFor is the first shape', () => {
    expect(voicingFor('D', GUITAR_TUNINGS['drop-d'])).toEqual(
      voicingsFor('D', GUITAR_TUNINGS['drop-d'])[0]?.frets ?? null,
    );
    expect(voicingsFor('Xyz')).toEqual([]);
  });

  test('barre flag', () => {
    expect(voicingsFor('F')[0]?.barre).toBe(true);
    expect(voicingsFor('Am')[0]?.barre).toBe(false);
  });
});

describe('barreOf', () => {
  test('only when the shape needs more than four fingers', () => {
    expect(barreOf([1, 3, 3, 2, 1, 1])).toEqual({ fret: 1, from: 0, to: 5 });
    expect(barreOf([null, 1, 3, 3, 3, 1])).toEqual({ fret: 1, from: 1, to: 5 });
    expect(barreOf([null, null, 0, 2, 3, 2])).toBeNull();
    expect(barreOf([3, 2, 0, 0, 0, 3])).toBeNull();
  });
});
```

Append to `packages/audio/src/strum-schedule.test.ts` (add `GUITAR_TUNINGS` to the chord-sheet import and `strumShape` to the `./strum-schedule` import):

```ts
describe('strumShape', () => {
  test('one down strum, thickest string first', () => {
    const notes = strumShape([null, 0, 2, 2, 1, 0]);
    expect(notes.map((note) => note.midi)).toEqual([45, 52, 57, 60, 64]);
    expect(notes.map((note) => note.string)).toEqual([5, 4, 3, 2, 1]);
    expect(notes[0]?.time).toBe(0);
    for (let i = 1; i < notes.length; i++) {
      expect(notes[i]?.time ?? 0).toBeGreaterThan(notes[i - 1]?.time ?? 0);
    }
  });

  test('strings and capo', () => {
    expect(strumShape([0, null, null, null, null, null], GUITAR_TUNINGS['drop-d'], 2)[0]?.midi).toBe(40);
  });
});

describe('scheduleNotes strings', () => {
  test('notes use the given open strings', () => {
    const notes = scheduleNotes([event('D', 0, 1, null)], [], {
      bpm: 120,
      strings: GUITAR_TUNINGS['drop-d'],
      voicing: () => [0, null, null, null, null, null],
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((note) => note.midi === 38 && note.string === 6)).toBe(true);
  });
});
```

Append to `packages/audio/src/tab-schedule.test.ts` (add `GUITAR_TUNINGS` to the chord-sheet import):

```ts
test('open strings of the given tuning', () => {
  const notes = scheduleTab(block('0.6 0.1'), { bpm: 60, strings: GUITAR_TUNINGS['drop-d'] });
  expect(notes.map((note) => note.midi)).toEqual([38, 64]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd packages/audio && bun test src/voicing.test.ts src/strum-schedule.test.ts src/tab-schedule.test.ts`
Expected: FAIL — `voicingsFor`, `barreOf`, `strumShape` are not exported; `strings` is ignored (midi 40/62 instead of 38).

- [ ] **Step 3: Rewrite `voicing.ts`**

```ts
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
  return maxFret - minFret + minFret * 0.4 + muted * 1.2 - open * 0.3;
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
```

- [ ] **Step 4: Open strings in `strum-schedule.ts`**

1. `ScheduleOptions` gains, after `capo`:

```ts
  /** Open strings as MIDI notes, thickest first; standard tuning when missing. */
  strings?: readonly number[];
```

2. In `scheduleNotes`, replace the first lines and the calls so every helper gets the strings:

```ts
  const strings = options.strings ?? OPEN_STRING_MIDI;
  const voicing = options.voicing ?? ((chord: string) => voicingFor(chord, strings));
  const capo = options.capo ?? 0;
```

   the tab branch becomes `scheduleTab(event.block, { bpm: event.tempo ?? options.bpm, capo, strings })`, and the strum call becomes `notes.push(...playStep(step, rhythm.kind, frets, time, capo, strings));`.

3. `note()` takes `strings` as its last parameter:

```ts
function note(
  index: number,
  fret: number,
  time: number,
  gain: number,
  muted: boolean,
  capo: number,
  strings: readonly number[],
) {
  return {
    time,
    midi: (strings[index] ?? strings[0]) + fret + capo,
    string: strings.length - index,
    gain,
    muted,
  };
}
```

4. `playStep(step, kind, frets, time, capo, strings)` passes `strings` to every `note(…)` and to `pickedString(ref, frets, sounding, strings)`; the `'x'` stroke strums every string: `return strum(strings.map((_, index) => index), 1, true);`.

5. `pickedString(ref, frets, sounding, strings)` uses `strings[bass]`/`strings[index]` instead of `OPEN_STRING_MIDI[…]`, and `const index = strings.length - ref;` instead of `6 - ref`.

6. Add after `scheduleNotes`:

```ts
const SHAPE_SPREAD_SEC = 0.03;

/** One slow down strum of a shape, for trying a chord out. */
export function strumShape(
  frets: GuitarFrets,
  strings: readonly number[] = OPEN_STRING_MIDI,
  capo = 0,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  frets.forEach((fret, index) => {
    if (fret !== null) {
      notes.push(
        note(index, fret, notes.length * SHAPE_SPREAD_SEC, PICK_GAIN, false, capo, strings),
      );
    }
  });
  return notes;
}
```

- [ ] **Step 5: Open strings in `tab-schedule.ts`**

Change the options type to `options: { bpm: number; capo?: number; strings?: readonly number[] }`, add `const strings = options.strings ?? OPEN_STRING_MIDI;` next to `capo`, and replace the `open` line with:

```ts
      const open = strings[strings.length - note.string] ?? strings[0];
```

- [ ] **Step 6: Run tests, types, lint**

Run: `cd packages/audio && bun test` → all PASS (the old `voicingFor` tests still pass). Root: `bunx turbo run check-types`, `bun run lint` → clean.

- [ ] **Step 7: Commit**

```bash
git add packages/audio/src
git commit -m "Find several voicings for any tuning and play them in it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Store tuning, voicings and zen mode with the arrangement

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: `apps/api/drizzle/<generated>/migration.sql` and `snapshot.json` (drizzle-kit)
- Modify: `apps/api/src/services/save-arrangement.ts`
- Modify: `apps/api/src/services/save-arrangement.test.ts`
- Modify: `apps/api/src/scripts/seed.ts` (only if it builds an `ArrangementInput` literal — add the three fields)

**Interfaces:**
- Consumes: `SONG_TUNING_IDS`, `SongTuningId`, `GUITAR_TUNINGS`, `isChord`, `isShape`, `Voicings`, `ZEN_MODES`, `ZenModeId`, `chordList` (chord-sheet).
- Produces: `arrangement.tuning: SongTuningId` (not null, default `'standard'`), `arrangement.voicings: Voicings` (not null, default `{}`), `arrangement.zenMode: ZenModeId | null`; `ArrangementInput` gains required `tuning`, `voicings`, `zenMode`; `MAX_VOICINGS = 64`. `ArrangementView` (the `byId` output) carries the three fields.

- [ ] **Step 1: Write the failing tests**

In `apps/api/src/services/save-arrangement.test.ts` add to `base`:

```ts
  tuning: 'standard',
  voicings: { Dm: [null, null, 0, 2, 3, 1] },
  zenMode: null,
```

and add the import `import { arrangementInput, type ArrangementInput, saveArrangement } from './save-arrangement';` (replace the current import of that module). Append inside `describe('saveArrangement', …)`:

```ts
  test('stores tuning, voicings and zen mode; drops voicings of chords not in the song', async () => {
    const saved = await saveArrangement(db, noopSearch, {
      authorId,
      input: {
        ...base,
        tuning: 'drop-d',
        voicings: { Dm: [null, null, 0, 2, 3, 1], G: [3, 2, 0, 0, 0, 3] },
        zenMode: 'strip',
      },
    });
    const row = await db.query.arrangement.findFirst({ where: { id: saved.id } });
    expect(row?.tuning).toBe('drop-d');
    expect(row?.voicings).toEqual({ Dm: [null, null, 0, 2, 3, 1] });
    expect(row?.zenMode).toBe('strip');
  });
```

and a new `describe` at the end of the file:

```ts
describe('arrangementInput', () => {
  const parse = (patch: Partial<ArrangementInput>) =>
    arrangementInput.safeParse({ ...base, ...patch }).success;

  test('accepts the defaults', () => {
    expect(parse({})).toBe(true);
    expect(parse({ voicings: {}, zenMode: 'inline', tuning: 'dadgad' })).toBe(true);
  });

  test('rejects unknown tunings and zen modes', () => {
    expect(parse({ tuning: 'banjo' as ArrangementInput['tuning'] })).toBe(false);
    expect(parse({ zenMode: 'auto' as ArrangementInput['zenMode'] })).toBe(false);
  });

  test('rejects bad voicings', () => {
    expect(parse({ voicings: { Am: [null, 0, 2, 2, 1] } })).toBe(false);
    expect(parse({ voicings: { Am: [null, 0, 2, 2, 1, 25] } })).toBe(false);
    expect(parse({ voicings: { Am: [null, null, null, null, null, null] } })).toBe(false);
    expect(parse({ voicings: { Куплет: [null, 0, 2, 2, 1, 0] } })).toBe(false);
  });

  test('at most 64 voicings', () => {
    const roots = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
    const keys = roots.flatMap((root) => ['', 'm', '7', 'm7', 'maj7', '6'].map((s) => root + s));
    const many = Object.fromEntries(keys.slice(0, 65).map((key) => [key, [0, 0, 0, 0, 0, 0]]));
    expect(parse({ voicings: many })).toBe(false);
    expect(parse({ voicings: Object.fromEntries(Object.entries(many).slice(0, 64)) })).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/api && bun test src/services/save-arrangement.test.ts`
Expected: FAIL — the new fields are stripped / columns do not exist.

- [ ] **Step 3: Schema**

In `apps/api/src/db/schema.ts` import the types:

```ts
import type { Rhythm, SongTuningId, Voicings, ZenModeId } from '@chordtune/chord-sheet';
```

(replace the existing `Rhythm` type import), and add to the `arrangement` columns after `tempo`:

```ts
    tuning: text('tuning').$type<SongTuningId>().notNull().default('standard'),
    /** The author's shape per chord (keyed like `chordList`), thickest string first. */
    voicings: jsonb('voicings').$type<Voicings>().notNull().default({}),
    /** Zen view the author suggests; `null` lets the app pick. */
    zenMode: text('zen_mode').$type<ZenModeId>(),
```

Generate the migration: `cd apps/api && bunx drizzle-kit generate` — it writes a new folder under `apps/api/drizzle/`. Check the SQL adds exactly `tuning text DEFAULT 'standard' NOT NULL`, `voicings jsonb DEFAULT '{}'::jsonb NOT NULL`, `zen_mode text` to `arrangement`.

- [ ] **Step 4: Validation and saving**

In `apps/api/src/services/save-arrangement.ts`:

```ts
import {
  chordList,
  isChord,
  isRhythm,
  isShape,
  parse,
  type Rhythm,
  SONG_TUNING_IDS,
  validate,
  ZEN_MODES,
} from '@chordtune/chord-sheet';
```

```ts
export const MAX_VOICINGS = 64;
const SONG_STRINGS = 6;
```

and in `arrangementInput` after `notes`:

```ts
  tuning: z.enum(SONG_TUNING_IDS),
  voicings: z
    .record(
      z.string(),
      z.custom<(number | null)[]>((value) => isShape(value, SONG_STRINGS), 'Invalid shape'),
    )
    .refine((voicings) => Object.keys(voicings).every(isChord), { message: 'Invalid chord' })
    .refine((voicings) => Object.keys(voicings).length <= MAX_VOICINGS, {
      message: `At most ${MAX_VOICINGS} voicings`,
    }),
  zenMode: z.enum(ZEN_MODES).nullable(),
```

In `saveArrangement`, compute the chords once and keep only voicings of chords in the song:

```ts
    const chords = chordList(doc);
    const values = {
      songId: songRow.id,
      content: input.content,
      rhythms: input.rhythms,
      chords,
      key: input.key || null,
      capo: input.capo,
      tempo: input.tempo,
      notes: input.notes,
      tuning: input.tuning,
      voicings: Object.fromEntries(
        Object.entries(input.voicings).filter(([chord]) => chords.includes(chord)),
      ),
      zenMode: input.zenMode,
    };
```

If `apps/api/src/scripts/seed.ts` builds an `ArrangementInput`, add `tuning: 'standard', voicings: {}, zenMode: null` there.

- [ ] **Step 5: Run tests and types**

Run: `cd apps/api && bun test` → all PASS. Root: `bunx turbo run check-types` — the web app will now fail where it builds an arrangement input or an `ArrangementView` literal (`song-form.tsx`); that is fixed in Task 5. Record the web errors in your report; `apps/api` itself must type-check. `bun run lint` → clean.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "Store tuning, voicings and zen mode with the arrangement

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The song's tuning end to end in the web app

**Files:**
- Modify: `apps/web/src/features/rhythm/playback.ts`
- Create: `apps/web/src/features/rhythm/song-sound.test.ts`
- Modify: `apps/web/src/features/editor/use-draft.ts`
- Modify: `apps/web/src/features/editor/song-meta.tsx`
- Modify: `apps/web/src/features/editor/song-form.tsx`
- Modify: `apps/web/src/features/editor/chord-editor.tsx`
- Modify: `apps/web/src/features/editor/visual-editor.tsx`
- Modify: `apps/web/src/features/tab/tab-editor-sheet.tsx`
- Modify: `apps/web/src/features/song/song-view.tsx`
- Modify: `apps/web/src/features/library/offline-store.ts`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `songTuning`, `SongTuning`, `SongTuningId`, `SONG_TUNING_IDS`, `isSongTuningId`, `Voicings`, `sanitizeVoicings`, `chordKey`, `isZenMode`, `ZenModeId` (chord-sheet); `voicingFor`, `strumShape` (audio); `ArrangementView` with `tuning`, `voicings`, `zenMode` (Task 4).
- Produces:
  - `type SongSound = { capo: number | null; tuning: SongTuning; voicings: Voicings }`, `songSound(source: { capo: number | null; tuning?: string | null; voicings?: Voicings | null }): SongSound`, `PlaybackOptions = { bpm: number; speed?: number } & Partial<SongSound>`, `shapePlayback(shape: readonly (number | null)[], sound: SongSound): ScheduledNote[]` (`playback.ts`).
  - `withSongDefaults(arrangement: ArrangementView): ArrangementView` (`offline-store.ts`).
  - `Draft` gains `tuning: SongTuningId; voicings: Voicings; zenMode: ZenModeId | null`.
  - `ChordEditor` prop `capo` is replaced by `sound: SongSound`; `VisualEditor` prop `capo` → `sound: SongSound`; `TabEditorSheet` prop `capo` → `sound: SongSound`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/rhythm/song-sound.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse } from '@chordtune/chord-sheet';

import { withSongDefaults } from '@/features/library/offline-store';
import type { ArrangementView } from '@/lib/trpc';
import { shapePlayback, songPlayback, songSound } from './playback';

const doc = parse('${E}la').doc;

describe('songSound', () => {
  test('defaults: standard tuning, no voicings', () => {
    const sound = songSound({ capo: null });
    expect(sound.tuning.id).toBe('standard');
    expect(sound.voicings).toEqual({});
  });

  test('a tuned-down song sounds a semitone lower', () => {
    const standard = songPlayback(doc, [], { bpm: 120, ...songSound({ capo: null }) }).notes;
    const lower = songPlayback(doc, [], {
      bpm: 120,
      ...songSound({ capo: null, tuning: 'half-step-down' }),
    }).notes;
    expect(lower.map((note) => note.midi)).toEqual(standard.map((note) => note.midi - 1));
  });

  test("the author's voicing is what sounds", () => {
    const sound = songSound({ capo: 2, voicings: { E: [0, null, null, null, null, null] } });
    const notes = songPlayback(doc, [], { bpm: 120, ...sound }).notes;
    expect(new Set(notes.map((note) => note.midi))).toEqual(new Set([42]));
  });

  test('shapePlayback strums a shape with capo and shift', () => {
    const sound = songSound({ capo: 1, tuning: 'd-standard' });
    expect(shapePlayback([0, null, null, null, null, null], sound)[0]?.midi).toBe(39);
  });
});

describe('withSongDefaults', () => {
  test('old offline copies get standard tuning, no voicings, no zen mode', () => {
    const old = { id: 'a', capo: null } as unknown as ArrangementView;
    expect(withSongDefaults(old)).toMatchObject({ tuning: 'standard', voicings: {}, zenMode: null });
    const fresh = { id: 'b', tuning: 'open-g', voicings: { G: [0] }, zenMode: 'strip' };
    expect(withSongDefaults(fresh as unknown as ArrangementView)).toMatchObject(fresh);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd apps/web && bun test src/features/rhythm/song-sound.test.ts`
Expected: FAIL — `songSound`, `shapePlayback`, `withSongDefaults` not exported.

- [ ] **Step 3: `playback.ts`**

Imports: add `type ScheduledNote` is already imported; add `strumShape, voicingFor` to the `@chordtune/audio` import and `chordKey, type SongTuning, songTuning, type Voicings` to the `@chordtune/chord-sheet` import.

Replace `PlaybackOptions` with:

```ts
/** How the song sounds: capo, tuning and the author's shapes. */
export type SongSound = { capo: number | null; tuning: SongTuning; voicings: Voicings };

/** `speed` plays everything that many times faster; tempo and bars stay as written. */
export type PlaybackOptions = { bpm: number; speed?: number } & Partial<SongSound>;

export function songSound(source: {
  capo: number | null;
  tuning?: string | null;
  voicings?: Voicings | null;
}): SongSound {
  return { capo: source.capo, tuning: songTuning(source.tuning), voicings: source.voicings ?? {} };
}

/** Capo plus the tuning's shift: how far every fretted note is moved. */
function soundCapo(capo: number | null | undefined, tuning: SongTuning): number {
  return (capo ?? 0) + tuning.shift;
}

/** One strum of a shape in the song's sound, for diagrams. */
export function shapePlayback(
  shape: readonly (number | null)[],
  sound: SongSound,
): ScheduledNote[] {
  return strumShape(shape, sound.tuning.strings, soundCapo(sound.capo, sound.tuning));
}
```

In `schedule(events, rhythms, options)` destructure `{ bpm, capo, speed = 1, tuning = songTuning('standard'), voicings = {} }` and replace the `scheduleNotes` call with:

```ts
  const voicing = (chord: string) => {
    const key = chordKey(chord);
    return (key ? voicings[key] : undefined) ?? voicingFor(chord, tuning.strings);
  };
  const notes = atSpeed(
    scheduleNotes(events, rhythms, {
      bpm,
      capo: soundCapo(capo, tuning),
      strings: tuning.strings,
      voicing,
    }),
    speed,
  );
```

In `tabPlayback(block, { bpm, capo, speed = 1, tuning = songTuning('standard') })` use `scheduleTab(block, { bpm: tempo, capo: soundCapo(capo, tuning), strings: tuning.strings })`.

- [ ] **Step 4: Offline defaults**

In `apps/web/src/features/library/offline-store.ts`:

```ts
/** Copies saved before tunings and voicings existed lack those fields. */
export function withSongDefaults(arrangement: ArrangementView): ArrangementView {
  return { tuning: 'standard', voicings: {}, zenMode: null, ...arrangement };
}
```

and return `withSongDefaults(...)` from `getOffline` (when found) and map `listOffline` results through it.

- [ ] **Step 5: Draft and form fields**

`use-draft.ts`: import `isSongTuningId, isZenMode, sanitizeVoicings, type SongTuningId, type Voicings, type ZenModeId` from chord-sheet; add to `Draft` (after `capo`):

```ts
  tuning: SongTuningId;
  voicings: Voicings;
  zenMode: ZenModeId | null;
```

`EMPTY_DRAFT` gets `tuning: 'standard', voicings: {}, zenMode: null`; `loadDraft` reads:

```ts
      tuning: isSongTuningId(data.tuning) ? data.tuning : 'standard',
      voicings: sanitizeVoicings(data.voicings, 6),
      zenMode: isZenMode(data.zenMode) ? data.zenMode : null,
```

`song-form.tsx`:
- when loading an existing arrangement, `setFields({ …, tuning: song.tuning, voicings: song.voicings, zenMode: song.zenMode, … })`;
- `const sound = useMemo(() => songSound(fields), [fields])` (import `songSound`);
- the save `input` gets `tuning: fields.tuning, voicings: fields.voicings, zenMode: fields.zenMode`;
- `previewArrangement` gets `tuning: fields.tuning, voicings: fields.voicings, zenMode: fields.zenMode`;
- `<ChordEditor … sound={sound} />` instead of `capo={fields.capo}`;
- `update` clears voicings when the tuning changes (they are frets in the old tuning):

```ts
  const update = (patch: Partial<SongFields>) => {
    const retuned = patch.tuning !== undefined && patch.tuning !== fields.tuning;
    if (retuned && Object.keys(fields.voicings).length > 0) {
      toast(t('voicingsReset'));
    }
    setFields((current) => ({ ...current, ...patch, ...(retuned ? { voicings: {} } : {}) }));
  };
```

`song-meta.tsx`: import `SONG_TUNING_IDS, songTuning` from chord-sheet and add a «Строй» select as the first field of the grid, which becomes `grid grid-cols-2 gap-3 sm:grid-cols-4`:

```tsx
            <div className="flex flex-col gap-1.5">
              <Label>{t('tuning')}</Label>
              <Select
                value={fields.tuning}
                items={tuningItems}
                onValueChange={(value) => onChange({ tuning: songTuning(value).id })}
              >
                <SelectTrigger className="h-10 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tuningItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
```

with, in `SongMetaSheet`,

```ts
  const tTuner = useTranslations('tuner');
  const tuningItems = SONG_TUNING_IDS.map((id) => ({
    value: id,
    label: tTuner(`tunings.guitar.${id}`),
  }));
```

`SongMetaCard` adds the tuning to `details` when it is not standard (after the artist): `fields.tuning !== 'standard' ? tTuner(`tunings.guitar.${fields.tuning}`) : null` (with `const tTuner = useTranslations('tuner');`).

- [ ] **Step 6: Editor and tab sheet take `sound`**

- `chord-editor.tsx`: prop `capo: number | null` → `sound: SongSound` (import the type from `@/features/rhythm/playback`); `const options = { bpm, ...sound };`; pass `sound={sound}` to `VisualEditor` instead of `capo`.
- `visual-editor.tsx`: prop `capo: number | null` → `sound: SongSound`; pass `sound={sound}` to `TabEditorSheet`.
- `tab-editor-sheet.tsx`: prop `capo: number | null` → `sound: SongSound`; `tabPlayback(block, { bpm, ...sound })` with `[block, bpm, sound]` as the memo deps.

- [ ] **Step 7: Song page**

In `song-view.tsx`:
- `const sound = useMemo(() => songSound(arrangement), [arrangement]);`
- `const options = { bpm, speed, ...sound };` and inside the `playing` memo `const opts = { bpm, speed, ...sound };` with deps `[player.playing, doc, rhythms, bpm, sound, speed]`;
- the details line shows the tuning when it is not standard, before the capo:

```tsx
          {sound.tuning.id !== 'standard' ? (
            <span>{t('tuning', { name: tTuner(`tunings.guitar.${sound.tuning.id}`) })}</span>
          ) : null}
```

  with `const tTuner = useTranslations('tuner');`.

- [ ] **Step 8: Copy**

`ru.json`: `"editor"` → `"tuning": "Строй"`, `"voicingsReset": "Аппликатуры сброшены: в другом строе это другие аккорды"`; `"song"` → `"tuning": "Строй: {name}"`.
`en.json`: `"editor"` → `"tuning": "Tuning"`, `"voicingsReset": "Voicings cleared: in another tuning they are other chords"`; `"song"` → `"tuning": "Tuning: {name}"`.

- [ ] **Step 9: Run tests, types, lint**

Run: `cd apps/web && bun test src` → all PASS. Root: `bunx turbo run check-types` → no errors anywhere; `bun run lint` → clean.

- [ ] **Step 10: Commit**

```bash
git add apps/web
git commit -m "Pick the song's tuning and play songs in it

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Chord diagram and fretboard components

**Files:**
- Create: `apps/web/src/features/chords/diagram-layout.ts`
- Create: `apps/web/src/features/chords/diagram-layout.test.ts`
- Create: `apps/web/src/features/chords/chord-diagram.tsx`
- Create: `apps/web/src/features/chords/fretboard.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json` (new `"chords"` namespace)

**Interfaces:**
- Consumes: `barreOf`, `Barre` (audio); `noteName` (chord-sheet).
- Produces:
  - `DIAGRAM_FRETS = 5`; `type DiagramLayout = { base: number; dots: { string: number; fret: number }[]; open: number[]; muted: number[]; barre: { fret: number; from: number; to: number } | null }` — `fret` values relative to `base` (1 = first drawn fret); `diagramLayout(frets: readonly (number | null)[]): DiagramLayout`.
  - `<ChordDiagram frets size?: 'sm' | 'md' className? />` (decorative SVG, `aria-hidden`).
  - `<Fretboard strings: readonly number[] frets: (number | null)[] onChange: (frets: (number | null)[]) => void fretCount?: number />`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/chords/diagram-layout.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { diagramLayout } from './diagram-layout';

describe('diagramLayout', () => {
  test('open chord from the nut', () => {
    expect(diagramLayout([null, 0, 2, 2, 1, 0])).toEqual({
      base: 1,
      dots: [
        { string: 2, fret: 2 },
        { string: 3, fret: 2 },
        { string: 4, fret: 1 },
      ],
      open: [1, 5],
      muted: [0],
      barre: null,
    });
  });

  test('barre at the nut: the barre string dots are not repeated', () => {
    expect(diagramLayout([1, 3, 3, 2, 1, 1])).toEqual({
      base: 1,
      dots: [
        { string: 1, fret: 3 },
        { string: 2, fret: 3 },
        { string: 3, fret: 2 },
      ],
      open: [],
      muted: [],
      barre: { fret: 1, from: 0, to: 5 },
    });
  });

  test('up the neck: frets relative to the lowest fretted fret', () => {
    expect(diagramLayout([null, 6, 8, 8, 8, 6])).toEqual({
      base: 6,
      dots: [
        { string: 2, fret: 3 },
        { string: 3, fret: 3 },
        { string: 4, fret: 3 },
      ],
      open: [],
      muted: [0],
      barre: { fret: 1, from: 1, to: 5 },
    });
  });

  test('a shape that reaches the 5th fret still starts at the nut', () => {
    expect(diagramLayout([null, null, 2, 4, 5, 2]).base).toBe(1);
    expect(diagramLayout([null, null, 3, 5, 6, 3]).base).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && bun test src/features/chords/diagram-layout.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `diagram-layout.ts`**

```ts
import { barreOf } from '@chordtune/audio';

export const DIAGRAM_FRETS = 5;

export type DiagramLayout = {
  /** The fret the first drawn row stands for; 1 draws the nut. */
  base: number;
  /** `string` is an index, thickest = 0; `fret` is relative to `base` (1 = first row). */
  dots: { string: number; fret: number }[];
  open: number[];
  muted: number[];
  barre: { fret: number; from: number; to: number } | null;
};

/** What a chord box draws: from the nut when the shape fits in five frets, else from its lowest fret. */
export function diagramLayout(frets: readonly (number | null)[]): DiagramLayout {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  const base = fretted.length === 0 || Math.max(...fretted) <= DIAGRAM_FRETS ? 1 : Math.min(...fretted);
  const barre = barreOf(frets);
  const dots: DiagramLayout['dots'] = [];
  const open: number[] = [];
  const muted: number[] = [];
  frets.forEach((fret, string) => {
    if (fret === null) {
      muted.push(string);
    } else if (fret === 0) {
      open.push(string);
    } else if (!(barre && fret === barre.fret && string >= barre.from && string <= barre.to)) {
      dots.push({ string, fret: fret - base + 1 });
    }
  });
  return {
    base,
    dots,
    open,
    muted,
    barre: barre ? { fret: barre.fret - base + 1, from: barre.from, to: barre.to } : null,
  };
}
```

- [ ] **Step 4: Write `chord-diagram.tsx`**

```tsx
import { cn } from '@/lib/utils';
import { DIAGRAM_FRETS, diagramLayout } from './diagram-layout';

const SIZES = {
  sm: { gap: 11, row: 13, dot: 4, font: 8 },
  md: { gap: 15, row: 18, dot: 5.5, font: 10 },
} as const;
const TOP = 12;
const LEFT = 14;

/** A chord box: strings, five frets, the nut or the first fret's number, `×`/`o`, dots, barre. */
export function ChordDiagram({
  frets,
  size = 'md',
  className,
}: {
  frets: readonly (number | null)[];
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { gap, row, dot, font } = SIZES[size];
  const layout = diagramLayout(frets);
  const strings = frets.length;
  const x = (string: number) => LEFT + string * gap;
  const y = (line: number) => TOP + line * row;
  const width = x(strings - 1) + 6;
  const height = y(DIAGRAM_FRETS) + 4;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('text-foreground', className)}
    >
      {layout.base > 1 && (
        <text
          x={LEFT - dot - 2}
          y={y(0.5) + font / 3}
          textAnchor="end"
          fontSize={font}
          className="fill-muted-foreground"
        >
          {layout.base}
        </text>
      )}
      <line
        x1={x(0)}
        x2={x(strings - 1)}
        y1={y(0)}
        y2={y(0)}
        stroke="currentColor"
        strokeWidth={layout.base === 1 ? 3 : 1}
      />
      {Array.from({ length: DIAGRAM_FRETS }, (_, i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: frets are positional
          key={i}
          x1={x(0)}
          x2={x(strings - 1)}
          y1={y(i + 1)}
          y2={y(i + 1)}
          stroke="currentColor"
          strokeOpacity={0.35}
        />
      ))}
      {Array.from({ length: strings }, (_, string) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: strings are positional
          key={string}
          x1={x(string)}
          x2={x(string)}
          y1={y(0)}
          y2={y(DIAGRAM_FRETS)}
          stroke="currentColor"
          strokeOpacity={0.6}
        />
      ))}
      {layout.open.map((string) => (
        <circle
          key={`o${string}`}
          cx={x(string)}
          cy={TOP - dot - 1}
          r={dot * 0.6}
          fill="none"
          stroke="currentColor"
        />
      ))}
      {layout.muted.map((string) => (
        <text
          key={`x${string}`}
          x={x(string)}
          y={TOP - 3}
          textAnchor="middle"
          fontSize={font}
          className="fill-muted-foreground"
        >
          ×
        </text>
      ))}
      {layout.barre && (
        <rect
          x={x(layout.barre.from) - dot}
          y={y(layout.barre.fret - 0.5) - dot}
          width={x(layout.barre.to) - x(layout.barre.from) + dot * 2}
          height={dot * 2}
          rx={dot}
          className="fill-chord"
        />
      )}
      {layout.dots.map(({ string, fret }) => (
        <circle
          key={`d${string}`}
          cx={x(string)}
          cy={y(fret - 0.5)}
          r={dot}
          className="fill-chord"
        />
      ))}
    </svg>
  );
}
```

- [ ] **Step 5: Write `fretboard.tsx`**

```tsx
'use client';

import { noteName } from '@chordtune/chord-sheet';
import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

import { cn } from '@/lib/utils';

const MARKERS = new Set([3, 5, 7, 9, 12]);

/**
 * A vertical neck to press notes on: one note per string, tap again to lift it; the row above
 * the nut switches a string between open (`o`) and not played (`×`).
 */
export function Fretboard({
  strings,
  frets,
  onChange,
  fretCount = 12,
}: {
  /** Open strings as MIDI notes, thickest first. */
  strings: readonly number[];
  frets: (number | null)[];
  onChange: (frets: (number | null)[]) => void;
  fretCount?: number;
}) {
  const t = useTranslations('chords');
  const set = (string: number, fret: number | null) =>
    onChange(strings.map((_, i) => (i === string ? fret : (frets[i] ?? null))));

  return (
    <div
      className="inline-grid select-none"
      style={{ gridTemplateColumns: `1.5rem repeat(${strings.length}, 2.5rem)` }}
    >
      <span />
      {strings.map((open, string) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: strings are positional
          key={string}
          type="button"
          aria-label={t('openString', { note: noteName(open) })}
          aria-pressed={frets[string] === 0}
          onClick={() => set(string, frets[string] === 0 ? null : 0)}
          className="h-8 font-semibold text-muted-foreground text-sm"
        >
          {frets[string] === 0 ? 'o' : frets[string] === null || frets[string] === undefined ? '×' : ''}
        </button>
      ))}
      {Array.from({ length: fretCount }, (_, i) => i + 1).map((fret) => (
        <Fragment key={fret}>
          <span className="flex items-center justify-end pr-1.5 text-muted-foreground text-xs tabular-nums">
            {MARKERS.has(fret) ? fret : ''}
          </span>
          {strings.map((open, string) => {
            const pressed = frets[string] === fret;
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: strings are positional
                key={string}
                type="button"
                aria-label={t('fret', { note: noteName(open), fret })}
                aria-pressed={pressed}
                onClick={() => set(string, pressed ? null : fret)}
                className={cn(
                  'relative flex h-10 items-center justify-center border-border border-b',
                  fret === 1 && 'border-t-4 border-t-foreground/70',
                )}
              >
                <span className="absolute inset-y-0 left-1/2 w-px bg-muted-foreground/50" />
                {pressed && (
                  <span className="relative flex size-7 items-center justify-center rounded-full bg-chord font-semibold text-[10px] text-background">
                    {noteName(open + fret)}
                  </span>
                )}
              </button>
            );
          })}
        </Fragment>
      ))}
      <span />
      {strings.map((open, string) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: strings are positional
          key={string}
          className="pt-1 text-center text-muted-foreground text-xs"
        >
          {noteName(open)}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Copy**

`ru.json`, new top-level namespace:

```json
  "chords": {
    "title": "Аккорды",
    "hide": "Скрыть аккорды",
    "show": "Показать аккорды",
    "previous": "Предыдущий вариант",
    "next": "Следующий вариант",
    "play": "Сыграть {chord}",
    "noShape": "Нет аппликатуры",
    "openString": "Струна {note}: открытая или не играть",
    "fret": "{note}, {fret} лад"
  }
```

`en.json`:

```json
  "chords": {
    "title": "Chords",
    "hide": "Hide chords",
    "show": "Show chords",
    "previous": "Previous shape",
    "next": "Next shape",
    "play": "Play {chord}",
    "noShape": "No shape",
    "openString": "{note} string: open or not played",
    "fret": "{note}, fret {fret}"
  }
```

- [ ] **Step 7: Run tests, types, lint**

Run: `cd apps/web && bun test src/features/chords/diagram-layout.test.ts` → PASS. Root: `bunx turbo run check-types`, `bun run lint` → clean.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "Add chord diagram and fretboard components

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Chord panel on the song page

**Files:**
- Create: `apps/web/src/features/chords/chord-variants.ts`
- Create: `apps/web/src/features/chords/chord-variants.test.ts`
- Create: `apps/web/src/features/chords/use-chord-panel.ts`
- Create: `apps/web/src/features/chords/chord-card.tsx`
- Create: `apps/web/src/features/chords/chord-panel.tsx`
- Modify: `apps/web/src/features/song/mark-chip.tsx`
- Modify: `apps/web/src/features/song/line-view.tsx`
- Modify: `apps/web/src/features/song/song-view.tsx`

**Interfaces:**
- Consumes: `voicingsFor` (audio); `chordList`, `chordKey`, `Shape`, `Voicings` (chord-sheet); `SongSound`, `shapePlayback` (Task 5); `ChordDiagram` (Task 6).
- Produces:
  - `chordVariants(chord: string, strings: readonly number[], authorShape?: Shape): Shape[]`.
  - `PANEL_KEY = 'chordtune.chords.panel'`, `readPanelOpen(value: string | null): boolean`, `useChordPanelOpen(): readonly [boolean, (open: boolean) => void]`.
  - `useChordBrowser(chords: string[], sound: SongSound): ChordBrowser` where `ChordBrowser = { chords: string[]; variants(chord: string): Shape[]; index(chord: string): number; setIndex(chord: string, index: number): void }`.
  - `<ChordCard chord browser onPlay size? className? />`, `<ChordSidebar browser onPlay open onOpenChange />`, `<ChordStrip browser onPlay open onOpenChange className? />`.
  - `MarkChip` gains `onClick?: (event: React.MouseEvent<HTMLElement>) => void` (chords only); `LineView` gains `onChord?: (chord: string, anchor: HTMLElement) => void`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/chords/chord-variants.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { GUITAR_TUNINGS } from '@chordtune/chord-sheet';

import { chordVariants } from './chord-variants';
import { readPanelOpen } from './use-chord-panel';

const STANDARD = GUITAR_TUNINGS.standard;

describe('chordVariants', () => {
  test('suggested shapes, catalog first', () => {
    const shapes = chordVariants('Am', STANDARD);
    expect(shapes[0]).toEqual([null, 0, 2, 2, 1, 0]);
    expect(shapes.length).toBeGreaterThan(1);
  });

  test("the author's shape leads and is not repeated", () => {
    const own = [5, 7, 7, 5, 5, 5];
    const shapes = chordVariants('Am', STANDARD, own);
    expect(shapes[0]).toEqual(own);
    expect(shapes.filter((shape) => shape.join() === own.join())).toHaveLength(1);
    const catalog = chordVariants('Am', STANDARD, [null, 0, 2, 2, 1, 0]);
    expect(catalog.filter((shape) => shape.join() === ',0,2,2,1,0')).toHaveLength(1);
  });

  test('not a chord: nothing', () => {
    expect(chordVariants('Куплет', STANDARD)).toEqual([]);
  });
});

describe('readPanelOpen', () => {
  test('open unless hidden', () => {
    expect(readPanelOpen(null)).toBe(true);
    expect(readPanelOpen('open')).toBe(true);
    expect(readPanelOpen('hidden')).toBe(false);
    expect(readPanelOpen('garbage')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && bun test src/features/chords/chord-variants.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Write `chord-variants.ts` and `use-chord-panel.ts`**

`chord-variants.ts`:

```ts
import { voicingsFor } from '@chordtune/audio';
import type { Shape } from '@chordtune/chord-sheet';

/** Shapes to page through for a chord: the author's first, then the suggested ones without it. */
export function chordVariants(
  chord: string,
  strings: readonly number[],
  authorShape?: Shape,
): Shape[] {
  const suggested = voicingsFor(chord, strings).map((voicing) => [...voicing.frets]);
  if (!authorShape) {
    return suggested;
  }
  const id = authorShape.join();
  return [authorShape, ...suggested.filter((shape) => shape.join() !== id)];
}
```

`use-chord-panel.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

export const PANEL_KEY = 'chordtune.chords.panel';

export function readPanelOpen(value: string | null): boolean {
  return value !== 'hidden';
}

/** Whether the chord panel is shown: one choice per device, for every song. */
export function useChordPanelOpen() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      setOpen(readPanelOpen(localStorage.getItem(PANEL_KEY)));
    } catch {
      // ignore unreadable storage
    }
  }, []);

  const change = useCallback((next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(PANEL_KEY, next ? 'open' : 'hidden');
    } catch {
      // storage can be unavailable in private mode
    }
  }, []);

  return [open, change] as const;
}
```

- [ ] **Step 4: Write `chord-card.tsx`**

```tsx
'use client';

import type { Shape } from '@chordtune/chord-sheet';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChordDiagram } from './chord-diagram';
import type { ChordBrowser } from './chord-panel';

/** A chord's name, its shape and arrows through the other shapes. Tap the diagram to hear it. */
export function ChordCard({
  chord,
  browser,
  onPlay,
  size = 'md',
  className,
}: {
  chord: string;
  browser: ChordBrowser;
  onPlay: (shape: Shape) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const t = useTranslations('chords');
  const variants = browser.variants(chord);
  const index = Math.min(browser.index(chord), Math.max(0, variants.length - 1));
  const shape = variants[index];
  const step = (delta: number) =>
    browser.setIndex(chord, (index + delta + variants.length) % variants.length);

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-border bg-surface px-2 pt-1.5 pb-1',
        className,
      )}
    >
      <span className="font-semibold text-chord text-sm">{chord}</span>
      {shape ? (
        <button
          type="button"
          aria-label={t('play', { chord })}
          className="rounded-lg"
          onClick={() => onPlay(shape)}
        >
          <ChordDiagram frets={shape} size={size} />
        </button>
      ) : (
        <span className="flex h-20 w-16 items-center text-center text-muted-foreground text-xs">
          {t('noShape')}
        </span>
      )}
      {variants.length > 1 ? (
        <div className="flex items-center text-muted-foreground text-xs tabular-nums">
          <Button variant="ghost" size="icon-xs" aria-label={t('previous')} onClick={() => step(-1)}>
            <ChevronLeft />
          </Button>
          {index + 1}/{variants.length}
          <Button variant="ghost" size="icon-xs" aria-label={t('next')} onClick={() => step(1)}>
            <ChevronRight />
          </Button>
        </div>
      ) : (
        <span className="h-6" />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Write `chord-panel.tsx`**

```tsx
'use client';

import type { Shape } from '@chordtune/chord-sheet';
import { ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { SongSound } from '@/features/rhythm/playback';
import { cn } from '@/lib/utils';
import { ChordCard } from './chord-card';
import { chordVariants } from './chord-variants';

export type ChordBrowser = {
  chords: string[];
  variants: (chord: string) => Shape[];
  index: (chord: string) => number;
  setIndex: (chord: string, index: number) => void;
};

/** Every chord's shapes and which one is shown, shared by the panel and the popover. */
export function useChordBrowser(chords: string[], sound: SongSound): ChordBrowser {
  const [shown, setShown] = useState<Record<string, number>>({});
  const { strings } = sound.tuning;
  const { voicings } = sound;
  const table = useMemo(
    () => new Map(chords.map((chord) => [chord, chordVariants(chord, strings, voicings[chord])])),
    [chords, strings, voicings],
  );

  return {
    chords,
    variants: (chord) => table.get(chord) ?? chordVariants(chord, strings, voicings[chord]),
    index: (chord) => shown[chord] ?? 0,
    setIndex: (chord, index) => setShown((current) => ({ ...current, [chord]: index })),
  };
}

type PanelProps = {
  browser: ChordBrowser;
  onPlay: (shape: Shape) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Wide screens: a column of chords to the right of the song that stays in view. */
export function ChordSidebar({ browser, onPlay, open, onOpenChange }: PanelProps) {
  const t = useTranslations('chords');
  if (browser.chords.length === 0) {
    return null;
  }
  return (
    <aside className="sticky top-[4.25rem] hidden max-h-[calc(100dvh-5.25rem)] shrink-0 self-start pt-4 lg:block">
      {open ? (
        <div className="flex w-56 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-xs uppercase tracking-wide">{t('title')}</h2>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('hide')}
              onClick={() => onOpenChange(false)}
            >
              <PanelRightClose />
            </Button>
          </div>
          <div className="grid max-h-[calc(100dvh-8rem)] grid-cols-2 gap-2 overflow-y-auto pb-2">
            {browser.chords.map((chord) => (
              <ChordCard key={chord} chord={chord} browser={browser} onPlay={onPlay} size="sm" />
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label={t('show')}
          onClick={() => onOpenChange(true)}
          className="flex flex-col items-center gap-2 rounded-xl bg-surface px-1.5 py-3 text-muted-foreground text-xs"
        >
          <PanelRightOpen className="size-4" />
          <span className="[writing-mode:vertical-rl]">{t('title')}</span>
        </button>
      )}
    </aside>
  );
}

/** Phones: a strip of chord cards under the title that scrolls sideways or folds into names. */
export function ChordStrip({ browser, onPlay, open, onOpenChange, className }: PanelProps & {
  className?: string;
}) {
  const t = useTranslations('chords');
  if (browser.chords.length === 0) {
    return null;
  }
  return (
    <section className={cn('flex flex-col gap-1', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t('hide') : t('show')}
        onClick={() => onOpenChange(!open)}
        className="flex items-center gap-2 text-left text-muted-foreground text-xs"
      >
        <span className="uppercase tracking-wide">{t('title')}</span>
        {!open && (
          <span className="min-w-0 truncate font-semibold text-chord text-sm normal-case">
            {browser.chords.join(' ')}
          </span>
        )}
        {open ? <ChevronUp className="ml-auto size-4" /> : <ChevronDown className="ml-auto size-4" />}
      </button>
      {open && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {browser.chords.map((chord) => (
            <ChordCard key={chord} chord={chord} browser={browser} onPlay={onPlay} size="sm" />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 6: Tappable chords in the text**

`mark-chip.tsx`: add the prop `onClick?: (event: React.MouseEvent<HTMLElement>) => void` and render the chord as a button when it is given:

```tsx
    case 'chord': {
      const classes = cn(
        'rounded px-0.5 font-semibold text-chord leading-5 transition-colors',
        active && 'bg-chord text-background',
        onClick && 'cursor-pointer hover:bg-chord/15',
        className,
      );
      return onClick ? (
        <button type="button" className={classes} onClick={onClick}>
          {item.chord}
        </button>
      ) : (
        <span className={classes}>{item.chord}</span>
      );
    }
```

`line-view.tsx`: `LineView` gains `onChord?: (chord: string, anchor: HTMLElement) => void` and passes to each `MarkChip`:

```tsx
                onClick={
                  item.type === 'chord' && onChord
                    ? (event) => onChord(item.chord, event.currentTarget)
                    : undefined
                }
```

- [ ] **Step 7: Wire the panel into `song-view.tsx`**

Imports: `chordKey, chordList, type Shape` from chord-sheet; `Popover, PopoverContent` from `@/components/ui/popover`; `ChordCard` from `@/features/chords/chord-card`; `ChordSidebar, ChordStrip, useChordBrowser` from `@/features/chords/chord-panel`; `useChordPanelOpen` from `@/features/chords/use-chord-panel`; `shapePlayback` from `@/features/rhythm/playback`.

State and helpers inside `SongView`:

```ts
  const chords = useMemo(() => chordList(doc), [doc]);
  const browser = useChordBrowser(chords, sound);
  const [panelOpen, setPanelOpen] = useChordPanelOpen();
  const [peek, setPeek] = useState<{ chord: string; anchor: HTMLElement } | null>(null);
  const playShape = (shape: Shape) => void player.play('shape', shapePlayback(shape, sound));
  const onChord = (raw: string, anchor: HTMLElement) => {
    const chord = chordKey(raw);
    if (chord) {
      setPeek({ chord, anchor });
    }
  };
```

Layout: the page becomes a row with the sidebar on wide screens; the editor preview keeps the single column and shows the strip at every width.

```tsx
  const article = (
    <article
      className={
        preview
          ? 'flex w-full flex-col gap-6 pb-24'
          : 'flex w-full min-w-0 max-w-2xl flex-1 flex-col gap-6 px-4 pt-4 pb-28'
      }
    >
      {/* …everything that was inside the article before, unchanged, plus the strip right after
          the <header>…</header> block: */}
      <ChordStrip
        browser={browser}
        onPlay={playShape}
        open={panelOpen}
        onOpenChange={setPanelOpen}
        className={preview ? undefined : 'lg:hidden'}
      />
      {/* …rhythms, sections (LineView gets onChord={onChord}), notes, SongDock, ZenMode… */}
      <Popover open={peek !== null} onOpenChange={(open) => !open && setPeek(null)}>
        <PopoverContent anchor={peek?.anchor ?? null} className="w-auto p-1.5">
          {peek && <ChordCard chord={peek.chord} browser={browser} onPlay={playShape} />}
        </PopoverContent>
      </Popover>
    </article>
  );

  if (preview) {
    return article;
  }
  return (
    <div className="mx-auto flex w-full max-w-2xl justify-center gap-6 lg:max-w-5xl">
      {article}
      <ChordSidebar
        browser={browser}
        onPlay={playShape}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </div>
  );
```

The section lines pass `onChord={onChord}` to `LineView`. Nothing else in the article changes.

- [ ] **Step 8: Run tests, types, lint**

Run: `cd apps/web && bun test src` → PASS. Root: `bunx turbo run check-types`, `bun run lint` → clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "Show the song's chord shapes in a panel and on tap

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: The author picks or draws shapes in the editor

**Files:**
- Create: `apps/web/src/features/chords/voicing-sheet.tsx`
- Create: `apps/web/src/features/chords/editor-chords.tsx`
- Create: `apps/web/src/features/chords/shape-check.ts`
- Create: `apps/web/src/features/chords/shape-check.test.ts`
- Modify: `apps/web/src/features/editor/chord-palette.tsx`
- Modify: `apps/web/src/features/editor/visual-editor.tsx`
- Modify: `apps/web/src/features/editor/chord-editor.tsx`
- Modify: `apps/web/src/features/editor/song-form.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `chordVariants` (Task 7), `ChordDiagram`, `Fretboard` (Task 6), `SongSound`, `shapePlayback` (Task 5), `nameChord`, `playsChord`, `shapeMidis`, `chordKey`, `chordList`, `Shape`, `Voicings` (chord-sheet).
- Produces:
  - `type ShapeCheck = { kind: 'match' } | { kind: 'other'; name: string } | { kind: 'unknown' } | { kind: 'empty' }`, `checkShape(shape: readonly (number | null)[], chord: string, strings: readonly number[]): ShapeCheck`.
  - `<VoicingSheet chord: string | null sound player onPick: (shape: Shape | null) => void onClose />`.
  - `<EditorChords chords: string[] sound onEdit: (chord: string) => void />`.
  - `ChordPalette` gains `onVoicing?: (chord: string) => void`; `VisualEditor` gains `onEditVoicing: (chord: string) => void`; `ChordEditor` gains `onVoicingsChange: (voicings: Voicings) => void`.

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/chords/shape-check.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { GUITAR_TUNINGS } from '@chordtune/chord-sheet';

import { checkShape } from './shape-check';

const STANDARD = GUITAR_TUNINGS.standard;

describe('checkShape', () => {
  test('the drawn shape plays the chord', () => {
    expect(checkShape([null, 0, 2, 2, 1, 0], 'Am', STANDARD)).toEqual({ kind: 'match' });
    expect(checkShape([null, 2, 4, 4, 3, 2], 'Hm', STANDARD)).toEqual({ kind: 'match' });
  });

  test('another chord: say which', () => {
    expect(checkShape([null, 0, 2, 2, 2, 0], 'Am', STANDARD)).toEqual({ kind: 'other', name: 'A' });
  });

  test('nothing known, nothing pressed', () => {
    expect(checkShape([0, 1, null, null, null, null], 'Am', STANDARD)).toEqual({ kind: 'unknown' });
    expect(checkShape([null, null, null, null, null, null], 'Am', STANDARD)).toEqual({
      kind: 'empty',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && bun test src/features/chords/shape-check.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `shape-check.ts`**

```ts
import { nameChord, playsChord, shapeMidis } from '@chordtune/chord-sheet';

export type ShapeCheck =
  | { kind: 'match' }
  | { kind: 'other'; name: string }
  | { kind: 'unknown' }
  | { kind: 'empty' };

/** Whether a drawn shape plays `chord`, and if not, what it sounds like. */
export function checkShape(
  shape: readonly (number | null)[],
  chord: string,
  strings: readonly number[],
): ShapeCheck {
  const midis = shapeMidis(shape, strings);
  if (midis.length === 0) {
    return { kind: 'empty' };
  }
  if (playsChord(midis, chord)) {
    return { kind: 'match' };
  }
  const name = nameChord(midis)[0];
  return name ? { kind: 'other', name } : { kind: 'unknown' };
}
```

- [ ] **Step 4: Write `voicing-sheet.tsx`**

```tsx
'use client';

import type { Shape } from '@chordtune/chord-sheet';
import { Check, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { type SongSound, shapePlayback } from '@/features/rhythm/playback';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { cn } from '@/lib/utils';
import { ChordDiagram } from './chord-diagram';
import { chordVariants } from './chord-variants';
import { Fretboard } from './fretboard';
import { checkShape } from './shape-check';

/**
 * The author's shape for one chord: pick one of the suggested shapes or draw one on the neck,
 * with a live check of what the drawing plays. `onPick(null)` goes back to the default.
 */
export function VoicingSheet({
  chord,
  sound,
  player,
  onPick,
  onClose,
}: {
  chord: string | null;
  sound: SongSound;
  player: StrumPlayerControls;
  onPick: (shape: Shape | null) => void;
  onClose: () => void;
}) {
  const t = useTranslations('chords');
  const { strings } = sound.tuning;
  const own = chord ? sound.voicings[chord] : undefined;
  const variants = chord ? chordVariants(chord, strings, own) : [];
  const selected = (own ?? variants[0])?.join();
  const [drawing, setDrawing] = useState<Shape | null>(null);
  const play = (shape: Shape) => void player.play('shape', shapePlayback(shape, sound));
  const check = chord && drawing ? checkShape(drawing, chord, strings) : null;

  const close = () => {
    setDrawing(null);
    onClose();
  };

  return (
    <Sheet open={chord !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-3xl"
      >
        <div className="flex flex-col gap-4 p-4 pt-0">
          <SheetHeader className="px-0">
            <SheetTitle>{t('voicingTitle', { chord: chord ?? '' })}</SheetTitle>
          </SheetHeader>
          {drawing ? (
            <div className="flex flex-col items-center gap-3">
              <Fretboard strings={strings} frets={drawing} onChange={setDrawing} />
              <p
                className={cn(
                  'text-sm',
                  check?.kind === 'match' ? 'font-semibold text-chord' : 'text-muted-foreground',
                )}
              >
                {check?.kind === 'match' && t('drawnMatches', { chord: chord ?? '' })}
                {check?.kind === 'other' &&
                  t('drawnSoundsLike', { name: check.name, chord: chord ?? '' })}
                {check?.kind === 'unknown' && t('drawnUnknown')}
                {check?.kind === 'empty' && t('drawnEmpty')}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => play(drawing)} disabled={check?.kind === 'empty'}>
                  <Play />
                  {t('listen')}
                </Button>
                <Button variant="ghost" onClick={() => setDrawing(null)}>
                  {t('cancel')}
                </Button>
                <Button
                  disabled={check?.kind === 'empty'}
                  onClick={() => {
                    onPick(drawing);
                    close();
                  }}
                >
                  {t('save')}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {variants.map((shape) => {
                  const id = shape.join();
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={id === selected}
                      onClick={() => {
                        play(shape);
                        onPick(shape);
                      }}
                      className={cn(
                        'relative rounded-2xl border border-border bg-surface p-1.5',
                        id === selected && 'border-chord ring-1 ring-chord',
                      )}
                    >
                      <ChordDiagram frets={shape} size="sm" />
                      {id === selected && (
                        <Check className="absolute top-1 right-1 size-3.5 text-chord" />
                      )}
                    </button>
                  );
                })}
                {variants.length === 0 && (
                  <p className="text-muted-foreground text-sm">{t('noShape')}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() =>
                    setDrawing([...(own ?? variants[0] ?? strings.map(() => null))])
                  }
                >
                  {t('drawOwn')}
                </Button>
                {own && (
                  <Button variant="ghost" onClick={() => onPick(null)}>
                    {t('byDefault')}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 5: Write `editor-chords.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';

import type { SongSound } from '@/features/rhythm/playback';
import { ChordDiagram } from './chord-diagram';
import { chordVariants } from './chord-variants';

/** The song's chords above the editor, each with the shape readers will see; tap to change it. */
export function EditorChords({
  chords,
  sound,
  onEdit,
}: {
  chords: string[];
  sound: SongSound;
  onEdit: (chord: string) => void;
}) {
  const t = useTranslations('chords');
  if (chords.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-muted-foreground text-xs uppercase tracking-wide">{t('title')}</h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chords.map((chord) => {
          const shape = chordVariants(chord, sound.tuning.strings, sound.voicings[chord])[0];
          return (
            <button
              key={chord}
              type="button"
              aria-label={t('editVoicing', { chord })}
              onClick={() => onEdit(chord)}
              className="flex shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-border bg-surface px-2 py-1.5"
            >
              <span className="font-semibold text-chord text-sm">
                {chord}
                {sound.voicings[chord] ? ' •' : ''}
              </span>
              {shape ? (
                <ChordDiagram frets={shape} size="sm" />
              ) : (
                <span className="flex h-20 w-16 items-center text-center text-muted-foreground text-xs">
                  {t('noShape')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Palette button, editor wiring**

`chord-palette.tsx`: new prop `onVoicing?: (chord: string) => void`; when `current?.type === 'chord'` and `onVoicing` is given, render before the remove button:

```tsx
        {current?.type === 'chord' && onVoicing && (
          <Button
            size="sm"
            variant="outline"
            className="justify-start"
            onClick={() => onVoicing(current.chord)}
          >
            <Guitar />
            {t('voicing')}
          </Button>
        )}
```

(`Guitar` from `lucide-react`.)

`visual-editor.tsx`: new prop `onEditVoicing: (chord: string) => void`; pass to `ChordPalette`:

```tsx
        onVoicing={(chord) => {
          const key = chordKey(chord);
          setTarget(null);
          if (key) {
            onEditVoicing(key);
          }
        }}
```

(`chordKey` from chord-sheet.)

`chord-editor.tsx`: new prop `onVoicingsChange: (voicings: Voicings) => void`; state `const [voicingChord, setVoicingChord] = useState<string | null>(null);`; `const chords = useMemo(() => chordList(doc), [doc]);`. In visual mode render, above `<VisualEditor …>`:

```tsx
        <>
          <EditorChords chords={chords} sound={sound} onEdit={setVoicingChord} />
          <VisualEditor … onEditVoicing={setVoicingChord} />
        </>
```

and once, after the mode switch block:

```tsx
      <VoicingSheet
        chord={voicingChord}
        sound={sound}
        player={player}
        onClose={() => setVoicingChord(null)}
        onPick={(shape) => {
          if (!voicingChord) {
            return;
          }
          const { [voicingChord]: _old, ...rest } = sound.voicings;
          onVoicingsChange(shape ? { ...rest, [voicingChord]: shape } : rest);
        }}
      />
```

`song-form.tsx`: `<ChordEditor … onVoicingsChange={(voicings) => update({ voicings })} />`.

- [ ] **Step 7: Copy**

`ru.json` → `"chords"` add:

```json
    "voicingTitle": "Аппликатура {chord}",
    "editVoicing": "Аппликатура {chord}",
    "drawOwn": "Нарисовать свою",
    "byDefault": "Как по умолчанию",
    "listen": "Послушать",
    "save": "Сохранить",
    "cancel": "Отмена",
    "drawnMatches": "{chord} ✓",
    "drawnSoundsLike": "Звучит как {name}, а не {chord}",
    "drawnUnknown": "Не похоже на известный аккорд",
    "drawnEmpty": "Отметь ноты на грифе"
```

and `"editor"` → `"palette"` add `"voicing": "Аппликатура"`.

`en.json` → `"chords"` add:

```json
    "voicingTitle": "{chord} shape",
    "editVoicing": "{chord} shape",
    "drawOwn": "Draw your own",
    "byDefault": "Use the default",
    "listen": "Listen",
    "save": "Save",
    "cancel": "Cancel",
    "drawnMatches": "{chord} ✓",
    "drawnSoundsLike": "Sounds like {name}, not {chord}",
    "drawnUnknown": "Not a chord we know",
    "drawnEmpty": "Press notes on the neck"
```

and `"editor"` → `"palette"` add `"voicing": "Shape"`.

- [ ] **Step 8: Run tests, types, lint**

Run: `cd apps/web && bun test src` → PASS. Root: `bunx turbo run check-types`, `bun run lint` → clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "Let the author pick or draw chord shapes in the editor

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
