# Stage D — The «Аккорды» Tab: Chord Finder and Shape Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new «Аккорды» tab: tap notes on a guitar, bass or ukulele neck and see what chord it is («Определить»), or type/pick a chord and see all its shapes («Найти»).

**Architecture:** A pure `identify()` turns pressed frets into notes and chord names (built on `nameChord` from stage A). The screen reuses stage A's `Fretboard`, `ChordDiagram`, `voicingsFor` and `strumShape`, and the tuner's instrument/tuning setting (`useTunerSettings`), so the tuner and the chords tab share one instrument choice.

**Tech Stack:** TypeScript 6, Bun test, React 19 / Next 16 (App Router, static export for Capacitor), Tailwind v4, next-intl, base-ui (`@/components/ui/*`), Biome.

**Spec:** `docs/superpowers/specs/2026-10-03-chords-capo-zen-design.md` (section 8).

**Depends on stage A** (`docs/superpowers/plans/2026-10-03-chords-a-voicings.md`): `nameChord`, `noteName`, `NOTE_NAMES`, `CHORD_SUFFIXES`, `shapeMidis`, `isReentrant`, `parseChord`, `isChord` (chord-sheet); `voicingsFor`, `strumShape`, `INSTRUMENTS`, `findTuning` (audio); `Fretboard`, `ChordDiagram` (`apps/web/src/features/chords/`).

## Global Constraints

- Route `/[locale]/chords`, client-rendered screen; works in the Capacitor static export (no server-only APIs in the screen).
- Navigation order: Тюнер · Песни · Аккорды · Моё.
- Instruments: guitar, bass, ukulele with the tuner's tunings; the tuner's `chromatic` instrument has no strings and shows as guitar standard here.
- The instrument/tuning choice is the tuner's (`chordtune.tuner.settings` via `useTunerSettings`): changing it here changes the tuner and back.
- Fretboard: 12 frets, one note per string, the row above the nut toggles open/not played.
- «Определить»: one note → its name; two notes → a power chord name (`E5`) if `nameChord` finds one, else the interval; three and more → up to 3 names from `nameChord` (`ignoreBass` in re-entrant tunings); nothing found → «Не похоже на известный аккорд», notes still shown.
- «Найти»: up to 12 shapes from `voicingsFor` for the chosen tuning; tap plays.
- UI copy in `apps/web/messages/ru.json` and `en.json`; UI is verified by the user by hand (no screenshots).
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Commands: web tests `cd apps/web && bun test <file>`; types `bunx turbo run check-types`; lint `bun run lint` (repo root).

## Review Focus

1. Switching from a 6-string guitar to a 4-string ukulele with notes pressed must not keep stale frets for strings that no longer exist (Task 2 resets the neck per tuning; Task 1 `identify` ignores frets past the last string).
2. The tuner left on «Хроматический» must not break the chords tab (Task 1 `chordInstrument` test).
3. A chord typed in the search box that is not a chord (`Куплет`, `H#`) shows a hint, not an error (Task 2).
4. Bass: two notes a fifth apart read as a power chord, not «unknown» (Task 1 test).
5. Ukulele GCEA `2000` reads as `Am`, not `Am/C` (Task 1 test).

---

### Task 1: `identify()` and the chords-tab instrument

**Files:**
- Create: `apps/web/src/features/chords/identify.ts`
- Create: `apps/web/src/features/chords/identify.test.ts`

**Interfaces:**
- Consumes: `nameChord`, `noteName`, `shapeMidis`, `isReentrant` (chord-sheet); `INSTRUMENTS`, `findTuning`, `type InstrumentId`, `type Tuning` (audio).
- Produces:
  - `type Identified = { kind: 'empty' } | { kind: 'note'; notes: string[] } | { kind: 'interval'; notes: string[]; semitones: number } | { kind: 'chord'; notes: string[]; names: string[] } | { kind: 'unknown'; notes: string[] }`.
  - `identify(frets: readonly (number | null)[], strings: readonly number[]): Identified` — `notes` are distinct note names from the lowest sounding note up; `semitones` is 1–11 above the lowest note.
  - `CHORD_INSTRUMENTS: readonly InstrumentId[] = ['guitar', 'bass', 'ukulele']`, `chordInstrument(instrument: InstrumentId, tuningId: string): Tuning` — the tuner setting as a tuning with strings (chromatic → guitar standard).

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/chords/identify.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';

import { chordInstrument, identify } from './identify';

const GUITAR = [40, 45, 50, 55, 59, 64];
const BASS = [28, 33, 38, 43];
const UKULELE = [67, 60, 64, 69];

describe('identify', () => {
  test('nothing pressed', () => {
    expect(identify([null, null, null, null, null, null], GUITAR)).toEqual({ kind: 'empty' });
  });

  test('one note, even on two strings', () => {
    // B string 5th fret and the open high E are the same E4.
    expect(identify([null, null, null, null, 5, 0], GUITAR)).toEqual({ kind: 'note', notes: ['E'] });
  });

  test('a fifth is a power chord, other pairs are intervals', () => {
    expect(identify([0, 2, null, null], BASS)).toEqual({
      kind: 'chord',
      notes: ['E', 'B'],
      names: ['E5'],
    });
    // E2 (6th string open) and G3 (4th string open): a minor third above E.
    expect(identify([0, null, null, 0, null, null], GUITAR)).toEqual({
      kind: 'interval',
      notes: ['E', 'G'],
      semitones: 3,
    });
    expect(identify([0, 1, null, null, null, null], GUITAR)).toEqual({
      kind: 'interval',
      notes: ['E', 'Bb'],
      semitones: 6,
    });
  });

  test('chords: up to three names, notes from the lowest up', () => {
    const am = identify([null, 0, 2, 2, 1, 0], GUITAR);
    expect(am.kind).toBe('chord');
    if (am.kind === 'chord') {
      expect(am.names[0]).toBe('Am');
      expect(am.names.length).toBeLessThanOrEqual(3);
      expect(am.notes).toEqual(['A', 'E', 'C']);
    }
  });

  test('ukulele is re-entrant: Am, and no slash chords', () => {
    const am = identify([2, 0, 0, 0], UKULELE);
    expect(am.kind).toBe('chord');
    if (am.kind === 'chord') {
      expect(am.names[0]).toBe('Am');
      expect(am.names.some((name) => name.includes('/'))).toBe(false);
    }
  });

  test('three notes of no known chord still list their notes', () => {
    // E2, Bb2, Eb3.
    expect(identify([0, 1, 1, null, null, null], GUITAR)).toEqual({
      kind: 'unknown',
      notes: ['E', 'Bb', 'Eb'],
    });
  });

  test('frets past the last string are ignored', () => {
    const am = identify([2, 0, 0, 0, 5, 5], UKULELE);
    expect(am.kind === 'chord' && am.names[0]).toBe('Am');
  });
});

describe('chordInstrument', () => {
  test('tuner setting as a tuning with strings', () => {
    expect(chordInstrument('ukulele', 'standard').strings).toEqual(UKULELE);
    expect(chordInstrument('bass', 'drop-d').strings).toEqual([26, 33, 38, 43]);
  });

  test('chromatic has no strings: guitar standard', () => {
    expect(chordInstrument('chromatic', 'chromatic').strings).toEqual(GUITAR);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && bun test src/features/chords/identify.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `identify.ts`**

```ts
import { findTuning, type InstrumentId, type Tuning } from '@chordtune/audio';
import { isReentrant, nameChord, noteName, shapeMidis } from '@chordtune/chord-sheet';

const MAX_NAMES = 3;

export type Identified =
  | { kind: 'empty' }
  | { kind: 'note'; notes: string[] }
  | { kind: 'interval'; notes: string[]; semitones: number }
  | { kind: 'chord'; notes: string[]; names: string[] }
  | { kind: 'unknown'; notes: string[] };

/** What pressed frets make: a note, an interval, a chord (with alternatives) or nothing known. */
export function identify(frets: readonly (number | null)[], strings: readonly number[]): Identified {
  const midis = shapeMidis(frets.slice(0, strings.length), strings).sort((a, b) => a - b);
  if (midis.length === 0) {
    return { kind: 'empty' };
  }
  const notes = [...new Set(midis.map(noteName))];
  if (notes.length === 1) {
    return { kind: 'note', notes };
  }
  const names = nameChord(midis, { ignoreBass: isReentrant(strings) }).slice(0, MAX_NAMES);
  if (names.length > 0) {
    return { kind: 'chord', notes, names };
  }
  if (notes.length === 2) {
    const lowest = midis[0] ?? 0;
    const other = midis.find((midi) => (midi - lowest) % 12 !== 0) ?? lowest;
    return { kind: 'interval', notes, semitones: (((other - lowest) % 12) + 12) % 12 };
  }
  return { kind: 'unknown', notes };
}

export const CHORD_INSTRUMENTS: readonly InstrumentId[] = ['guitar', 'bass', 'ukulele'];

/** The tuner's instrument and tuning, as strings to press; chromatic falls back to guitar. */
export function chordInstrument(instrument: InstrumentId, tuningId: string): Tuning {
  // An unknown tuning id falls back to the instrument's first tuning (guitar: standard).
  return findTuning(CHORD_INSTRUMENTS.includes(instrument) ? instrument : 'guitar', tuningId);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd apps/web && bun test src/features/chords/identify.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/chords/identify.ts apps/web/src/features/chords/identify.test.ts
git commit -m "Identify notes, intervals and chords from pressed frets

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The «Аккорды» tab

**Files:**
- Create: `apps/web/src/app/[locale]/chords/page.tsx`
- Create: `apps/web/src/features/chords/chords-screen.tsx`
- Create: `apps/web/src/features/chords/chord-finder.tsx`
- Create: `apps/web/src/features/chords/chord-search.tsx`
- Create: `apps/web/src/features/chords/instrument-picker.tsx`
- Modify: `apps/web/src/components/app-shell.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: `identify`, `chordInstrument`, `CHORD_INSTRUMENTS` (Task 1); `useTunerSettings` (`@/features/tuner/settings`); `Fretboard`, `ChordDiagram` (stage A); `voicingsFor`, `strumShape` (audio); `NOTE_NAMES`, `CHORD_SUFFIXES`, `parseChord`, `isChord` (chord-sheet); `useStrumPlayer` (`@/features/rhythm/use-strum-player`).
- Produces: `<ChordsScreen />`, `<ChordFinder strings player />`, `<ChordSearch strings player />`, `<InstrumentPicker instrument tuningId onChange />`.

- [ ] **Step 1: Copy**

`ru.json`: `"app"` → `"nav"` add `"chords": "Аккорды"`. `"chords"` (stage A namespace) add:

```json
    "pageTitle": "Аккорды",
    "identify": "Определить",
    "search": "Найти",
    "identifyHint": "Отметь ноты на грифе — покажу, что это за аккорд",
    "clear": "Очистить",
    "notes": "Ноты: {notes}",
    "unknown": "Не похоже на известный аккорд",
    "searchPlaceholder": "Аккорд, например F#m7",
    "notAChord": "Не похоже на аккорд",
    "shapesFor": "Аппликатуры {chord}",
    "intervals": {
      "1": "Малая секунда",
      "2": "Большая секунда",
      "3": "Малая терция",
      "4": "Большая терция",
      "5": "Кварта",
      "6": "Тритон",
      "7": "Квинта",
      "8": "Малая секста",
      "9": "Большая секста",
      "10": "Малая септима",
      "11": "Большая септима"
    }
```

`en.json`: `"app"` → `"nav"` add `"chords": "Chords"`. `"chords"` add:

```json
    "pageTitle": "Chords",
    "identify": "Identify",
    "search": "Find",
    "identifyHint": "Press notes on the neck to see which chord it is",
    "clear": "Clear",
    "notes": "Notes: {notes}",
    "unknown": "Not a chord we know",
    "searchPlaceholder": "A chord, e.g. F#m7",
    "notAChord": "That doesn't look like a chord",
    "shapesFor": "{chord} shapes",
    "intervals": {
      "1": "Minor second",
      "2": "Major second",
      "3": "Minor third",
      "4": "Major third",
      "5": "Perfect fourth",
      "6": "Tritone",
      "7": "Perfect fifth",
      "8": "Minor sixth",
      "9": "Major sixth",
      "10": "Minor seventh",
      "11": "Major seventh"
    }
```

- [ ] **Step 2: The page and the nav tab**

`apps/web/src/app/[locale]/chords/page.tsx`:

```tsx
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ChordsScreen } from '@/features/chords/chords-screen';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/chords'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'chords' });
  return { title: t('pageTitle') };
}

export default async function ChordsPage({ params }: PageProps<'/[locale]/chords'>) {
  await resolveLocale(params);
  return <ChordsScreen />;
}
```

`app-shell.tsx`: import `Grid3x3` from `lucide-react`; `TABS` becomes

```ts
const TABS = [
  { href: '/', key: 'tuner', icon: AudioLines },
  { href: '/songs', key: 'songs', icon: ListMusic },
  { href: '/chords', key: 'chords', icon: Grid3x3 },
  { href: '/library', key: 'library', icon: Bookmark },
] as const;
```

and the mobile nav grid `grid-cols-3` becomes `grid-cols-4`.

- [ ] **Step 3: `instrument-picker.tsx`**

```tsx
'use client';

import { getInstrument, type InstrumentId } from '@chordtune/audio';
import { useTranslations } from 'next-intl';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { CHORD_INSTRUMENTS } from './identify';

/** Guitar, bass or ukulele and its tuning — the same setting as the tuner's. */
export function InstrumentPicker({
  instrument,
  tuningId,
  onChange,
}: {
  instrument: InstrumentId;
  tuningId: string;
  onChange: (patch: { instrument: InstrumentId; tuningId: string }) => void;
}) {
  const t = useTranslations('tuner');
  const tunings = getInstrument(instrument).tunings;
  const tuningLabel = (id: string) =>
    // keys are generated from the tuning catalogue, which the message files mirror
    t(`tunings.${instrument}.${id}` as 'tunings.guitar.standard');
  const items = tunings.map((tuning) => ({ value: tuning.id, label: tuningLabel(tuning.id) }));

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        variant="outline"
        spacing={0}
        value={[instrument]}
        onValueChange={(value) => {
          const next = CHORD_INSTRUMENTS.find((id) => id === value[0]);
          if (next) {
            onChange({ instrument: next, tuningId: getInstrument(next).tunings[0]?.id ?? 'standard' });
          }
        }}
      >
        {CHORD_INSTRUMENTS.map((id) => (
          <ToggleGroupItem key={id} value={id} className="px-3">
            {t(`instruments.${id}`)}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Select
        value={tuningId}
        items={items}
        onValueChange={(value) => value && onChange({ instrument, tuningId: String(value) })}
      >
        <SelectTrigger className="h-9 min-w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
```

- [ ] **Step 4: `chord-finder.tsx` («Определить»)**

```tsx
'use client';

import { strumShape } from '@chordtune/audio';
import { Eraser } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { Fretboard } from './fretboard';
import { identify } from './identify';

/** Press notes on the neck; the chord they make, its alternatives and its notes appear beside. */
export function ChordFinder({
  strings,
  player,
}: {
  strings: readonly number[];
  player: StrumPlayerControls;
}) {
  const t = useTranslations('chords');
  const [frets, setFrets] = useState<(number | null)[]>(() => strings.map(() => null));
  const result = identify(frets, strings);
  const play = () => void player.play('finder', strumShape(frets, strings));

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <Fretboard strings={strings} frets={frets} onChange={setFrets} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {result.kind === 'empty' && (
          <p className="text-muted-foreground text-sm">{t('identifyHint')}</p>
        )}
        {result.kind === 'note' && (
          <button type="button" onClick={play} className="text-left font-bold font-display text-5xl text-chord">
            {result.notes[0]}
          </button>
        )}
        {result.kind === 'interval' && (
          <button type="button" onClick={play} className="text-left font-bold font-display text-3xl">
            {t(`intervals.${result.semitones}` as 'intervals.1')}
          </button>
        )}
        {result.kind === 'chord' && (
          <>
            <button type="button" onClick={play} className="text-left font-bold font-display text-5xl text-chord">
              {result.names[0]}
            </button>
            {result.names.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {result.names.slice(1).map((name) => (
                  <span key={name} className="rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold text-sm">
                    {name}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {result.kind === 'unknown' && <p className="font-semibold text-lg">{t('unknown')}</p>}
        {result.kind !== 'empty' && (
          <p className="text-muted-foreground text-sm">{t('notes', { notes: result.notes.join(' ') })}</p>
        )}
        <Button
          variant="outline"
          className="self-start"
          disabled={result.kind === 'empty'}
          onClick={() => setFrets(strings.map(() => null))}
        >
          <Eraser />
          {t('clear')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: `chord-search.tsx` («Найти»)**

```tsx
'use client';

import { strumShape, voicingsFor } from '@chordtune/audio';
import { CHORD_SUFFIXES, isChord, NOTE_NAMES, parseChord } from '@chordtune/chord-sheet';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Input } from '@/components/ui/input';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { cn } from '@/lib/utils';
import { ChordDiagram } from './chord-diagram';

const SEARCH_LIMIT = 12;

/** Type a chord or tap a root and a quality; every shape for it on the chosen instrument. */
export function ChordSearch({
  strings,
  player,
}: {
  strings: readonly number[];
  player: StrumPlayerControls;
}) {
  const t = useTranslations('chords');
  const [query, setQuery] = useState('Am');
  const chord = query.trim();
  const parsed = parseChord(chord);
  const root = parsed?.root ?? 'C';
  const suffix = parsed?.suffix ?? '';
  const shapes = isChord(chord) ? voicingsFor(chord, strings, { limit: SEARCH_LIMIT }) : [];

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'rounded-full px-2.5 py-1 font-semibold text-sm ring-1 ring-border',
        active && 'bg-chord text-background ring-chord',
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-4">
      <Input
        value={query}
        aria-invalid={chord !== '' && !isChord(chord)}
        placeholder={t('searchPlaceholder')}
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        className="max-w-xs"
        onChange={(event) => setQuery(event.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {NOTE_NAMES.map((name) => chip(name, parsed?.root === name, () => setQuery(name + suffix)))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CHORD_SUFFIXES.map((quality) =>
          chip(root + quality, parsed !== null && suffix === quality, () => setQuery(root + quality)),
        )}
      </div>
      {chord !== '' && !isChord(chord) ? (
        <p className="text-muted-foreground text-sm">{t('notAChord')}</p>
      ) : shapes.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('noShape')}</p>
      ) : (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground text-xs uppercase tracking-wide">
            {t('shapesFor', { chord })}
          </h2>
          <div className="flex flex-wrap gap-2">
            {shapes.map(({ frets }) => (
              <button
                key={frets.join()}
                type="button"
                aria-label={t('play', { chord })}
                onClick={() => void player.play('search', strumShape(frets, strings))}
                className="rounded-2xl border border-border bg-surface p-1.5"
              >
                <ChordDiagram frets={frets} size="sm" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 6: `chords-screen.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useStrumPlayer } from '@/features/rhythm/use-strum-player';
import { useTunerSettings } from '@/features/tuner/settings';
import { ChordFinder } from './chord-finder';
import { ChordSearch } from './chord-search';
import { CHORD_INSTRUMENTS, chordInstrument } from './identify';
import { InstrumentPicker } from './instrument-picker';

type Mode = 'identify' | 'search';

/** The «Аккорды» tab: tell what chord the pressed notes are, or show every shape of a chord. */
export function ChordsScreen() {
  const t = useTranslations('chords');
  const [settings, update] = useTunerSettings();
  const [mode, setMode] = useState<Mode>('identify');
  const player = useStrumPlayer();
  const tuning = chordInstrument(settings.instrument, settings.tuningId);
  const instrument = CHORD_INSTRUMENTS.includes(settings.instrument) ? settings.instrument : 'guitar';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-4 pb-28">
      <h1 className="font-bold font-display text-3xl tracking-tight">{t('pageTitle')}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          variant="outline"
          spacing={0}
          value={[mode]}
          onValueChange={(value) => {
            if (value[0] === 'identify' || value[0] === 'search') {
              player.stop();
              setMode(value[0]);
            }
          }}
        >
          <ToggleGroupItem value="identify" className="px-4">
            {t('identify')}
          </ToggleGroupItem>
          <ToggleGroupItem value="search" className="px-4">
            {t('search')}
          </ToggleGroupItem>
        </ToggleGroup>
        <InstrumentPicker
          instrument={instrument}
          tuningId={tuning.id}
          onChange={(patch) => {
            player.stop();
            update(patch);
          }}
        />
      </div>
      {mode === 'identify' ? (
        // A new tuning is a new neck: start with nothing pressed.
        <ChordFinder key={`${tuning.instrument}:${tuning.id}`} strings={tuning.strings} player={player} />
      ) : (
        <ChordSearch strings={tuning.strings} player={player} />
      )}
    </div>
  );
}
```

- [ ] **Step 7: Run tests, types, lint**

Run: `cd apps/web && bun test src` → PASS. Root: `bunx turbo run check-types`, `bun run lint` → clean (run `bun run format` if lint only reports formatting).

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "Add the chords tab with a chord finder and shape search

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
