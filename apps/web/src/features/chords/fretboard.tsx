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
          {frets[string] === 0
            ? 'o'
            : frets[string] === null || frets[string] === undefined
              ? '×'
              : ''}
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
