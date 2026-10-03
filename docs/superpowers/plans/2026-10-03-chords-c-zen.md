# Stage C — Zen Views, Pause Panel and «Play From Here» Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In zen mode the next two lines stay readable, chords show either above the words or as a fixed strip of the section's chords, zen opens paused with a panel (view, speed, capo, start), the text scrolls by hand while paused, and a tap on a line or chord starts from there.

**Architecture:** Pure helpers in `apps/web/src/features/zen/zen-view.ts` (mode resolution, row emphasis, the section strip, seek times) and a per-line tempo in `zen-timing.ts`. `LineView` gets a «dots» rendering and reports which chord was tapped. `ZenMode` gains a `ready` phase, a pause panel, the strip and a drag/wheel scroll with tap-to-seek while paused. The song page resolves the view from the listener's per-song setting (stage B's `useSongSettings`), the author's `zenMode` (stage A) and the chord count.

**Tech Stack:** TypeScript 6, Bun test, React 19 / Next 16, Tailwind v4, motion, next-intl, base-ui, Biome.

**Spec:** `docs/superpowers/specs/2026-10-03-chords-capo-zen-design.md` (section 10).

**Depends on stages A and B:** `ZenModeId`, `ZEN_MODES`, `chordKey`, `chordList` (chord-sheet); `arrangement.zenMode`, `Draft.zenMode`, `SongSound`, `chordVariants`, `ChordDiagram` (stage A); `useSongSettings`, `CapoPicker`, the recalculated `view` document and `viewSound` in `song-view.tsx` (stage B).

## Global Constraints

- Row brightness by on-screen line order: current 100% (chord lines also `scale-[1.04]`), next 75%, the one after 55%, further 30%, past 15%.
- Modes: `inline` (chords above words) and `strip` (fixed row of the current section's chords in order of first appearance; the sounding one filled, the next *different* chord outlined; words without chords, a dot under the syllable where a chord starts, the sounding chord's dot lit).
- Mode resolution: listener's per-song choice → `arrangement.zenMode` → auto: `strip` when the song has at most 4 distinct chords, else `inline`. The listener's choice is saved per song (`useSongSettings`).
- Phases: `ready → count → play ⇄ pause → count → play … → done`. Zen opens in `ready` at the start of the song. Starting or resuming always counts 3-2-1.
- Panel (in `ready` and `pause`): mode, speed (`SpeedChips`), capo (`CapoPicker`), a big «Начать» (`ready`) / «Продолжить» (`pause`), «Сначала».
- While playing: a tap anywhere on the text or Space pauses; hiding the app pauses (as now). While paused: the text scrolls by finger drag or wheel; a tap on a line starts from its first chord (an untimed line → the next timed line), a tap on a chord (or its dot) starts from that chord; the chosen place is highlighted until the next start.
- The beat dots follow the tempo of the current line (section `NNbpm` / block `\tempo`), not only the song tempo.
- Editor: «Zen по умолчанию: Авто / Над словами / Полоса» in the song details sheet (`fields.zenMode`: `null` / `'inline'` / `'strip'`).
- UI copy in `apps/web/messages/ru.json` and `en.json`; UI is verified by the user by hand (no screenshots).
- Commits end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- Commands: `cd apps/web && bun test <file>`; root `bunx turbo run check-types`, `bun run lint`.

## Review Focus

1. A drag that ends over a chord does not also seek there (Task 4: clicks after a drag are swallowed).
2. A tap on a plain lyrics line between chord lines starts at the next chord line, never at time 0 by accident (Task 1 `seekTime` test).
3. The last chord of a section has no «next» ring when the next chord is outside the strip (Task 1 `sectionStrip` test).
4. A tab-only song (no chords) in strip mode shows no empty strip (Task 3 `ZenStrip` returns null for no chords).
5. Resuming after a hand scroll without picking a place returns the view to the playing line (Task 4 resets the drag offset on start).

---

### Task 1: Pure helpers for zen views

**Files:**
- Create: `apps/web/src/features/zen/zen-view.ts`
- Create: `apps/web/src/features/zen/zen-view.test.ts`
- Modify: `apps/web/src/features/zen/zen-timing.ts` (`ZenLine.tempo`)
- Modify: `apps/web/src/features/zen/zen-timing.test.ts`

**Interfaces:**
- Consumes: `chordKey`, `chordList`, `SongDoc`, `ZenModeId` (chord-sheet); `ZenLine`, `ZenPosition`, `zenLines` (`zen-timing.ts`).
- Produces:
  - `ZenLine` gains `tempo: number` — the BPM of the line's first event (`event.tempo ?? bpm`).
  - `AUTO_STRIP_MAX_CHORDS = 4`, `resolveZenMode(listener: ZenModeId | null, author: ZenModeId | null, doc: SongDoc): ZenModeId`.
  - `type RowEmphasis = 'current' | 'next' | 'after' | 'later' | 'past'`, `rowEmphasis(row: number, currentRow: number): RowEmphasis`.
  - `type StripState = { chords: string[]; current: number | null; next: number | null }`, `sectionStrip(doc: SongDoc, lines: ZenLine[], position: ZenPosition): StripState` (`chords` as written, deduplicated by `chordKey`; `current`/`next` index into `chords`).
  - `seekTime(lines: ZenLine[], section: number, line: number, item?: number | null): number | null`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/zen/zen-view.test.ts`:

```ts
/// <reference types="bun" />

import { describe, expect, test } from 'bun:test';
import { parse } from '@chordtune/chord-sheet';

import { zenLines, zenPosition } from './zen-timing';
import { resolveZenMode, rowEmphasis, sectionStrip, seekTime } from './zen-view';

const doc = (source: string) => parse(source).doc;
// 60 BPM, no rhythms: one chord = one 4/4 bar = 4 s.
const SONG = doc('[Куплет]\n${Am}a ${F}b\nпросто текст\n${C}c ${G}d\n[Припев]\n${Em}e ${Em}f ${D}g');
const LINES = zenLines(SONG, [], 60);
const at = (time: number) => sectionStrip(SONG, LINES, zenPosition(LINES, time));

describe('resolveZenMode', () => {
  test('listener, then author, then auto by chord count', () => {
    const four = doc('${Am}a ${F}b ${C}c ${G}d ${Am}e');
    const five = doc('${Am}a ${F}b ${C}c ${G}d ${E}e');
    expect(resolveZenMode('inline', 'strip', four)).toBe('inline');
    expect(resolveZenMode(null, 'inline', four)).toBe('inline');
    expect(resolveZenMode(null, null, four)).toBe('strip');
    expect(resolveZenMode(null, null, five)).toBe('inline');
  });
});

describe('rowEmphasis', () => {
  test('by distance from the current row', () => {
    expect([3, 4, 5, 6, 9, 2].map((row) => rowEmphasis(row, 3))).toEqual([
      'current',
      'next',
      'after',
      'later',
      'later',
      'past',
    ]);
  });
});

describe('sectionStrip', () => {
  test('the section chords in order, the sounding one and the next different one', () => {
    expect(at(0)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 0, next: 1 });
    expect(at(4)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 1, next: 2 });
  });

  test('no ring when the next chord is outside the strip', () => {
    expect(at(12)).toEqual({ chords: ['Am', 'F', 'C', 'G'], current: 3, next: null });
  });

  test('a repeated chord rings the next different one', () => {
    expect(at(16)).toEqual({ chords: ['Em', 'D'], current: 0, next: 1 });
  });
});

describe('seekTime', () => {
  // `parse` drops the empty section before the first header: «Куплет» is section 0.
  test('a line starts at its first chord, a chord at itself', () => {
    expect(seekTime(LINES, 0, 0)).toBe(0);
    expect(seekTime(LINES, 0, 0, 2)).toBe(4);
    expect(seekTime(LINES, 0, 2, 0)).toBe(8);
  });

  test('an untimed line starts at the next timed line; past the end there is nothing', () => {
    expect(seekTime(LINES, 0, 1)).toBe(8);
    expect(seekTime(LINES, 1, 5)).toBeNull();
  });
});
```

Append to `zen-timing.test.ts`:

```ts
describe('ZenLine tempo', () => {
  test('section and block tempos reach the line', () => {
    const lines = zenLines(doc('${Am}a\n[Соло] 120bpm\n${G}b'), [], 60);
    expect(lines.map((line) => line.tempo)).toEqual([60, 120]);
  });
});
```

and add `tempo: 60` to each object of the existing `toEqual` in `lines last as many bars as they have chords`.

- [ ] **Step 2: Run them to verify they fail**

Run: `cd apps/web && bun test src/features/zen` — Expected: FAIL (`zen-view` missing; `tempo` undefined).

- [ ] **Step 3: `ZenLine.tempo`**

In `zen-timing.ts`, `ZenLine` gains:

```ts
  /** BPM of the line's first event: its section's or block's tempo, else the song's. */
  tempo: number;
```

and the object created for a new line gets `tempo: event.tempo ?? bpm`.

- [ ] **Step 4: Write `zen-view.ts`**

```ts
import { chordKey, chordList, type SongDoc, type ZenModeId } from '@chordtune/chord-sheet';

import type { ZenLine, ZenPosition } from './zen-timing';

export const AUTO_STRIP_MAX_CHORDS = 4;

/** The listener's choice, else the author's, else the strip for songs of at most four chords. */
export function resolveZenMode(
  listener: ZenModeId | null,
  author: ZenModeId | null,
  doc: SongDoc,
): ZenModeId {
  return (
    listener ?? author ?? (chordList(doc).length <= AUTO_STRIP_MAX_CHORDS ? 'strip' : 'inline')
  );
}

export type RowEmphasis = 'current' | 'next' | 'after' | 'later' | 'past';

/** How bright a row is, by its distance from the current row in the order rows are shown. */
export function rowEmphasis(row: number, currentRow: number): RowEmphasis {
  const distance = row - currentRow;
  if (distance < 0) {
    return 'past';
  }
  return distance === 0 ? 'current' : distance === 1 ? 'next' : distance === 2 ? 'after' : 'later';
}

export type StripState = { chords: string[]; current: number | null; next: number | null };

/** The chord (by `chordKey`) at the `k`-th chord of a zen line, or null for tab beats. */
function chordAt(doc: SongDoc, zen: ZenLine | undefined, k: number): string | null {
  const line = zen ? doc.sections[zen.section]?.lines[zen.line] : undefined;
  if (!zen || line?.type !== 'line') {
    return null;
  }
  const item = line.items[zen.chordItems[k] ?? -1];
  return item?.type === 'chord' ? chordKey(item.chord) : null;
}

/**
 * The chords of the section being played, in order of first appearance, with the one sounding
 * and the next different one coming (null when it is not in this section's strip).
 */
export function sectionStrip(doc: SongDoc, lines: ZenLine[], position: ZenPosition): StripState {
  const playing = lines[position.index];
  if (!playing) {
    return { chords: [], current: null, next: null };
  }
  const chords: string[] = [];
  const keys: string[] = [];
  for (const line of doc.sections[playing.section]?.lines ?? []) {
    if (line.type !== 'line') {
      continue;
    }
    for (const item of line.items) {
      const key = item.type === 'chord' ? chordKey(item.chord) : null;
      if (item.type === 'chord' && key && !keys.includes(key)) {
        keys.push(key);
        chords.push(item.chord);
      }
    }
  }

  const now = chordAt(doc, playing, position.chord);
  let upcoming: string | null = null;
  for (let i = position.index, k = position.chord + 1; i < lines.length && !upcoming; i++, k = 0) {
    const zen = lines[i];
    for (; zen && k < zen.chordItems.length; k++) {
      const key = chordAt(doc, zen, k);
      if (key && key !== now) {
        upcoming = key;
        break;
      }
    }
  }

  const current = now ? keys.indexOf(now) : -1;
  const next = upcoming ? keys.indexOf(upcoming) : -1;
  return { chords, current: current >= 0 ? current : null, next: next >= 0 ? next : null };
}

/**
 * When to start from a tapped line (its first chord) or one of its chords (`item`, an index into
 * the line's items); a line that takes no time starts at the next line that does.
 */
export function seekTime(
  lines: ZenLine[],
  section: number,
  line: number,
  item: number | null = null,
): number | null {
  const zen = lines.find(
    (candidate) =>
      candidate.section > section || (candidate.section === section && candidate.line >= line),
  );
  if (!zen) {
    return null;
  }
  if (item !== null && zen.section === section && zen.line === line) {
    const k = zen.chordItems.indexOf(item);
    if (k >= 0) {
      return zen.chordStarts[k] ?? zen.start;
    }
  }
  return zen.start;
}
```

- [ ] **Step 5: Run tests** — `cd apps/web && bun test src/features/zen` → PASS; root types/lint clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/zen
git commit -m "Add zen view helpers: mode, row emphasis, section strip, seek times

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Chord dots in `LineView`, and which chord was tapped

**Files:**
- Modify: `apps/web/src/features/song/line-view.tsx`

**Interfaces:**
- Produces: `LineView` props become `{ items; activeItem?; onChord?: (chord: string, anchor: HTMLElement, item: number) => void; marks?: 'chips' | 'dots' }`. A chord tap stops propagation (so a parent row's click does not also fire). In `dots` mode only chord items are drawn — as dots under the words; bars, rhythm keys and repeats are hidden; a line with no chord items renders as plain text.

- [ ] **Step 1: Implement**

```tsx
/** Read-only line with chords above the syllables they belong to, or dots under them. */
export function LineView({
  items,
  activeItem,
  onChord,
  marks = 'chips',
}: {
  items: readonly Item[];
  /** Index of the item being played, to highlight its chord. */
  activeItem?: number | null;
  /** A tap on a chord; `item` is its index in `items`. */
  onChord?: (chord: string, anchor: HTMLElement, item: number) => void;
  /** `dots`: the zen strip view — chords become dots under the words, other marks are hidden. */
  marks?: 'chips' | 'dots';
}) {
  const dots = marks === 'dots';
  const shown = (item: Item) => item.type !== 'text' && (!dots || item.type === 'chord');
  const hasMarks = items.some(shown);
  if (!hasMarks) {
    const text = items.map((item) => (item.type === 'text' ? item.text : '')).join('');
    return <p className="min-h-6 whitespace-pre-wrap leading-6">{text}</p>;
  }
  const hasText = items.some((item) => item.type === 'text' && item.text.trim());
  const tap =
    (chord: string, index: number) => (event: React.MouseEvent<HTMLElement>) => {
      event.stopPropagation();
      onChord?.(chord, event.currentTarget, index);
    };

  return (
    <div className="flex flex-wrap items-end">
      {segments(items).map((segment, index) => {
        const words = hasText && (
          <span className={cn('whitespace-pre-wrap leading-6', !segment.text && 'min-w-2')}>
            {segment.text.trim() ? segment.text : segment.text.replace(/ /g, ' ')}
          </span>
        );
        return (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity besides order
            key={index}
            className="inline-flex flex-col"
          >
            {dots ? (
              <>
                {words}
                <span className="flex h-3 items-start gap-1.5 pl-0.5">
                  {segment.marks.flatMap(({ item, index: itemIndex }) => {
                    if (item.type !== 'chord') {
                      return [];
                    }
                    const dot = (
                      <span
                        className={cn(
                          'block size-1.5 rounded-full bg-chord/45 transition-all',
                          activeItem === itemIndex && 'size-2.5 bg-chord shadow-glow',
                        )}
                      />
                    );
                    return onChord ? (
                      <button
                        key={itemIndex}
                        type="button"
                        aria-label={item.chord}
                        className="-m-1.5 p-1.5"
                        onClick={tap(item.chord, itemIndex)}
                      >
                        {dot}
                      </button>
                    ) : (
                      <span key={itemIndex}>{dot}</span>
                    );
                  })}
                </span>
              </>
            ) : (
              <>
                <span className="flex min-h-5 items-end gap-0.5 pr-1">
                  {segment.marks.map(({ item, index: itemIndex }) => (
                    <MarkChip
                      key={itemIndex}
                      item={item}
                      active={activeItem === itemIndex}
                      onClick={
                        item.type === 'chord' && onChord ? tap(item.chord, itemIndex) : undefined
                      }
                    />
                  ))}
                </span>
                {words}
              </>
            )}
          </span>
        );
      })}
    </div>
  );
}
```

The song page's existing `onChord={(raw, anchor) => …}` keeps working (it ignores the third argument).

- [ ] **Step 2: Types, lint, tests** — root `bunx turbo run check-types`, `bun run lint`; `cd apps/web && bun test src` → PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/features/song/line-view.tsx
git commit -m "Draw chords as dots under the words and report the tapped chord

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Ready phase, pause panel, row brightness, strip view

**Files:**
- Create: `apps/web/src/features/zen/zen-strip.tsx`
- Create: `apps/web/src/features/zen/zen-panel.tsx`
- Modify: `apps/web/src/features/zen/zen-mode.tsx`
- Modify: `apps/web/src/features/song/song-view.tsx`
- Modify: `apps/web/src/features/editor/song-meta.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json`

**Interfaces:**
- Consumes: Task 1 helpers; `LineView` `marks` (Task 2); `SpeedChips` (`@/features/song/speed-chips`); `chordVariants`, `ChordDiagram` (stage A); `SongSound`; `CapoPicker`, `useSongSettings` (stage B).
- Produces:
  - `<ZenStrip strip: StripState sound: SongSound />` (renders nothing without chords).
  - `<ZenPanel phase: 'ready' | 'pause' mode onModeChange speed onSpeedChange capoControl?: React.ReactNode onStart onFromStart />`.
  - `ZenMode` props: `{ doc; rhythms; bpm; speed; onSpeedChange; mode: ZenModeId; onModeChange: (mode: ZenModeId) => void; sound: SongSound; capoControl?: React.ReactNode; title; artist; played; onFinished; onClose }`.

- [ ] **Step 1: Copy**

`ru.json` → `"zen"` add:

```json
    "start": "Начать",
    "fromStart": "Сначала",
    "view": "Аккорды",
    "viewInline": "Над словами",
    "viewStrip": "Полоса",
    "pickStart": "Листай текст и тапни строку или аккорд — начнём оттуда",
    "showShapes": "Показать аппликатуры"
```

`"editor"` add: `"zenMode": "Zen по умолчанию"`, `"zenAuto": "Авто"`, `"zenInline": "Над словами"`, `"zenStrip": "Полоса"`.

`en.json` → `"zen"` add:

```json
    "start": "Start",
    "fromStart": "From the top",
    "view": "Chords",
    "viewInline": "Above the words",
    "viewStrip": "Strip",
    "pickStart": "Scroll and tap a line or a chord to start there",
    "showShapes": "Show shapes"
```

`"editor"` add: `"zenMode": "Zen default"`, `"zenAuto": "Auto"`, `"zenInline": "Above the words"`, `"zenStrip": "Strip"`.

- [ ] **Step 2: `zen-strip.tsx`**

```tsx
'use client';

import { chordKey } from '@chordtune/chord-sheet';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ChordDiagram } from '@/features/chords/chord-diagram';
import { chordVariants } from '@/features/chords/chord-variants';
import type { SongSound } from '@/features/rhythm/playback';
import { cn } from '@/lib/utils';
import type { StripState } from './zen-view';

/** The section's chords in a fixed row: the sounding one filled, the next one outlined. */
export function ZenStrip({ strip, sound }: { strip: StripState; sound: SongSound }) {
  const t = useTranslations('zen');
  const [shapes, setShapes] = useState(false);
  if (strip.chords.length === 0) {
    return null;
  }
  return (
    <button
      type="button"
      aria-expanded={shapes}
      aria-label={t('showShapes')}
      onClick={() => setShapes((open) => !open)}
      className="relative z-20 mx-4 flex flex-col items-center gap-2 rounded-2xl bg-surface/85 px-3 py-2 backdrop-blur-xl"
    >
      <span className="flex flex-wrap justify-center gap-2">
        {strip.chords.map((chord, index) => (
          <span
            key={chord}
            className={cn(
              'rounded-lg px-2 py-0.5 font-bold text-2xl text-chord transition-colors duration-150',
              index === strip.current && 'bg-chord text-background shadow-glow',
              index === strip.next && 'ring-2 ring-chord',
            )}
          >
            {chord}
          </span>
        ))}
      </span>
      {shapes && (
        <span className="flex flex-wrap justify-center gap-2">
          {strip.chords.map((chord) => {
            const key = chordKey(chord) ?? chord;
            const shape = chordVariants(chord, sound.tuning.strings, sound.voicings[key])[0];
            return shape ? <ChordDiagram key={chord} frets={shape} size="sm" /> : null;
          })}
        </span>
      )}
    </button>
  );
}
```

- [ ] **Step 3: `zen-panel.tsx`**

```tsx
'use client';

import type { ZenModeId } from '@chordtune/chord-sheet';
import { Play, SkipBack } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SpeedChips } from '@/features/song/speed-chips';

/** Before the start and on pause: how chords look, speed, capo, and where to go. */
export function ZenPanel({
  phase,
  mode,
  onModeChange,
  speed,
  onSpeedChange,
  capoControl,
  onStart,
  onFromStart,
}: {
  phase: 'ready' | 'pause';
  mode: ZenModeId;
  onModeChange: (mode: ZenModeId) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  capoControl?: React.ReactNode;
  onStart: () => void;
  onFromStart: () => void;
}) {
  const t = useTranslations('zen');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-3xl border border-border bg-popover/95 p-4 shadow-lg backdrop-blur-xl">
      <p className="text-center text-muted-foreground text-xs">{t('pickStart')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          variant="outline"
          spacing={0}
          aria-label={t('view')}
          value={[mode]}
          onValueChange={(value) => {
            if (value[0] === 'inline' || value[0] === 'strip') {
              onModeChange(value[0]);
            }
          }}
        >
          <ToggleGroupItem value="inline" className="px-3">
            {t('viewInline')}
          </ToggleGroupItem>
          <ToggleGroupItem value="strip" className="px-3">
            {t('viewStrip')}
          </ToggleGroupItem>
        </ToggleGroup>
        {capoControl && <span className="text-sm">{capoControl}</span>}
      </div>
      <SpeedChips speed={speed} onChange={onSpeedChange} className="justify-center" />
      <div className="flex gap-2">
        <Button variant="outline" className="h-12 rounded-2xl" onClick={onFromStart}>
          <SkipBack />
          {t('fromStart')}
        </Button>
        <Button className="h-12 flex-1 rounded-2xl text-base shadow-glow" onClick={onStart}>
          <Play />
          {phase === 'ready' ? t('start') : t('resume')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `zen-mode.tsx`**

1. New props (see Interfaces); import `ZenModeId` from chord-sheet, `SongSound` from playback, `ZenPanel`, `ZenStrip`, and `resolveZenMode`-free helpers `rowEmphasis`, `sectionStrip` from `./zen-view`.
2. `type Phase = 'ready' | 'count' | 'play' | 'pause' | 'done';` and `useState<Phase>('ready')`.
3. Starting:

```ts
  const start = useCallback(() => {
    setCount(COUNT_FROM);
    setPhase('count');
  }, []);

  const fromStart = () => {
    timeRef.current = 0;
    finished.current = false;
    setTime(0);
  };
```

   `restart` (the done card's «Ещё раз») keeps going straight to the count. `togglePause` becomes: `play` → `pause`; `ready`/`pause` → `start()`. The Space handler does the same (`count`/`done` ignore it).
4. Row order and emphasis, replacing `isCurrent`/`isPast`:

```ts
  const rowKeys = useMemo(
    () => doc.sections.flatMap((section, s) => section.lines.map((_, l) => `${s}:${l}`)),
    [doc],
  );
  const currentRow = current ? rowKeys.indexOf(`${current.section}:${current.line}`) : -1;
```

   and for each row `const emphasis = rowEmphasis(rowKeys.indexOf(key), currentRow); const isCurrent = emphasis === 'current';` with the row classes

```ts
const EMPHASIS: Record<RowEmphasis, string> = {
  current: 'opacity-100',
  next: 'opacity-75',
  after: 'opacity-55',
  later: 'opacity-30',
  past: 'opacity-15',
};
```

   `cn('origin-left py-2 text-xl transition-[opacity,transform] duration-500', EMPHASIS[emphasis], isCurrent && line.type === 'line' && 'scale-[1.04]')`. (Keep the existing active-beat/active-chord props driven by `isCurrent`.)
5. Strip mode — `position` is a fresh object every frame, so memo on its index and chord only:

```ts
  const { index: playingIndex, chord: playingChord } = position;
  const strip = useMemo(
    () => sectionStrip(doc, lines, { index: playingIndex, chord: playingChord, progress: 0, done: false }),
    [doc, lines, playingIndex, playingChord],
  );
```

   Render `{mode === 'strip' && <ZenStrip strip={strip} sound={sound} />}` right after the `<header>`; chord lines render `<LineView … marks={mode === 'strip' ? 'dots' : 'chips'} />`.
6. Beat dots follow the line tempo: `const beatSec = 60 / (current?.tempo ?? bpm); const beat = Math.floor(Math.max(0, time - (current?.start ?? 0)) / beatSec) % 4;`.
7. The tap-to-pause overlay renders only while `phase === 'play'`.
8. The footer: while `ready` or `pause` render the panel instead of the play footer:

```tsx
      {phase === 'ready' || phase === 'pause' ? (
        <footer className="relative z-30 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <ZenPanel
            phase={phase}
            mode={mode}
            onModeChange={onModeChange}
            speed={speed}
            onSpeedChange={onSpeedChange}
            capoControl={capoControl}
            onStart={start}
            onFromStart={fromStart}
          />
        </footer>
      ) : (
        <footer …existing play footer, without the SpeedChips…>
      )}
```

   The play footer keeps the pause button (`disabled` during `count` and `done`), the beat dots and the time.

- [ ] **Step 5: `song-view.tsx`**

```ts
  const zenMode = resolveZenMode(settings.zenMode, arrangement.zenMode, view);
```

(`resolveZenMode` from `@/features/zen/zen-view`; `settings`/`updateSettings` and `view`/`viewSound`/`capo`/`authorCapo` come from stage B.) Pass to `ZenMode`:

```tsx
            mode={zenMode}
            onModeChange={(next) => updateSettings({ zenMode: next })}
            sound={viewSound}
            capoControl={
              <CapoPicker
                value={capo}
                authorCapo={authorCapo}
                hints={() => capoHints(doc, sound.tuning.strings, authorCapo)}
                onChange={(next) => updateSettings({ capo: next })}
              />
            }
```

In the editor preview (`preview`), `settings` are empty, so the mode is the author's or auto.

- [ ] **Step 6: Editor default — `song-meta.tsx`**

Add a select after the notes textarea:

```tsx
          <div className="flex flex-col gap-1.5">
            <Label>{t('zenMode')}</Label>
            <Select
              value={fields.zenMode ?? 'auto'}
              items={zenItems}
              onValueChange={(value) =>
                onChange({ zenMode: value === 'inline' || value === 'strip' ? value : null })
              }
            >
              <SelectTrigger className="h-10 w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {zenItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
```

with

```ts
  const zenItems = [
    { value: 'auto', label: t('zenAuto') },
    { value: 'inline', label: t('zenInline') },
    { value: 'strip', label: t('zenStrip') },
  ];
```

- [ ] **Step 7: Types, lint, tests** — root `bunx turbo run check-types`, `bun run lint`; `cd apps/web && bun test src` → PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web
git commit -m "Open zen paused with a panel, add the chord strip view and row brightness

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Scroll while paused, tap a line or chord to start there

**Files:**
- Modify: `apps/web/src/features/zen/zen-mode.tsx`

**Interfaces:**
- Consumes: `seekTime` (Task 1); `LineView` `onChord` with the item index (Task 2).
- Produces: no new exports.

- [ ] **Step 1: State**

```ts
const DRAG_THRESHOLD_PX = 6;

  const paused = phase === 'ready' || phase === 'pause';
  const [nudge, setNudge] = useState(0);
  const [startAt, setStartAt] = useState<{ time: number; key: string; item: number | null } | null>(
    null,
  );
  const content = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; from: number; moved: boolean } | null>(null);
  const dragged = useRef(false);

  const clampNudge = (value: number) => {
    const height = viewport.current?.clientHeight ?? 0;
    const length = content.current?.scrollHeight ?? 0;
    return Math.min(height, Math.max(-length, value));
  };
```

- [ ] **Step 2: Start from the picked place**

`start` becomes:

```ts
  const start = () => {
    if (startAt) {
      timeRef.current = startAt.time;
      finished.current = false;
      setTime(startAt.time);
    }
    setStartAt(null);
    setNudge(0);
    setCount(COUNT_FROM);
    setPhase('count');
  };
```

and `fromStart` also clears `startAt` and `nudge`. (Drop `useCallback` around `start` if it now reads state; the keyboard effect must read the latest `start` — keep a `startRef.current = start` assigned on every render and call `startRef.current()` from the key handler.)

```ts
  const pick = (section: number, line: number, item: number | null = null) => {
    const time = seekTime(lines, section, line, item);
    if (time !== null) {
      setStartAt({ time, key: `${section}:${line}`, item });
    }
  };
```

- [ ] **Step 3: Drag and wheel on the viewport while paused**

On the viewport `<div ref={viewport} …>` add (only meaningful while `paused`; guard each handler with `if (!paused) return;`):

```tsx
        className={cn('-mt-20 relative flex-1 overflow-hidden', paused && 'touch-none')}
        onWheel={(event) => paused && setNudge((value) => clampNudge(value - event.deltaY))}
        onPointerDown={(event) => {
          if (paused) {
            drag.current = { y: event.clientY, from: nudge, moved: false };
          }
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current) {
            return;
          }
          const dy = event.clientY - current.y;
          if (Math.abs(dy) > DRAG_THRESHOLD_PX) {
            current.moved = true;
          }
          if (current.moved) {
            setNudge(clampNudge(current.from + dy));
          }
        }}
        onPointerUp={() => {
          dragged.current = drag.current?.moved ?? false;
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClickCapture={(event) => {
          // A drag that ends over a line or a chord is not a tap.
          if (dragged.current) {
            dragged.current = false;
            event.stopPropagation();
            event.preventDefault();
          }
        }}
```

The content `<div>` gets `ref={content}` and `style={{ transform: `translateY(${offset + nudge}px)` }}`.

- [ ] **Step 4: Taps on rows and chords while paused**

Each row `<div>` gets, when `paused`:

```tsx
                    role={paused ? 'button' : undefined}
                    tabIndex={paused ? 0 : undefined}
                    onClick={paused ? () => pick(sectionIndex, lineIndex) : undefined}
                    onKeyDown={
                      paused
                        ? (event) => {
                            if (event.key === 'Enter') {
                              pick(sectionIndex, lineIndex);
                            }
                          }
                        : undefined
                    }
```

and the class adds `startAt?.key === key && 'rounded-xl ring-2 ring-chord/60'`. Chord lines pass

```tsx
                        onChord={paused ? (_chord, _anchor, item) => pick(sectionIndex, lineIndex, item) : undefined}
                        activeItem={
                          paused && startAt?.key === key
                            ? startAt.item
                            : isCurrent
                              ? (current?.chordItems[position.chord] ?? null)
                              : null
                        }
```

(`LineView` stops the chord click from reaching the row.) If Biome flags the row `div` (`noStaticElementInteractions` / `useSemanticElements`), keep the `role="button"` + `tabIndex` + `onKeyDown` and add a `biome-ignore` with the reason «a row holds chord buttons, so it cannot be a <button>».

- [ ] **Step 5: Types, lint, tests** — root `bunx turbo run check-types`, `bun run lint`; `cd apps/web && bun test src` → PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/features/zen/zen-mode.tsx
git commit -m "Scroll zen text while paused and start from a tapped line or chord

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```
