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
          chip(root + quality, parsed !== null && suffix === quality, () =>
            setQuery(root + quality),
          ),
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
