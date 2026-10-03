'use client';

import { strumShape } from '@chordtune/audio';
import { Eraser, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { Fretboard } from './fretboard';
import { identify } from './identify';

/** Press notes on the neck; the chord they make, its alternatives and its notes appear beside. */
export function ChordFinder({
  strings,
  player,
  frets,
  onFretsChange,
}: {
  strings: readonly number[];
  player: StrumPlayerControls;
  frets: (number | null)[];
  onFretsChange: (frets: (number | null)[]) => void;
}) {
  const t = useTranslations('chords');
  const result = identify(frets, strings);
  const play = () => void player.play('finder', strumShape(frets, strings));
  const clear = () => {
    if (player.playing === 'finder') {
      player.stop();
    }
    onFretsChange(strings.map(() => null));
  };

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start">
      <Fretboard strings={strings} frets={frets} onChange={onFretsChange} />
      <div
        className="order-first flex min-w-0 flex-1 flex-col gap-3 md:order-none"
        aria-live="polite"
      >
        {result.kind === 'empty' && (
          <p className="text-muted-foreground text-sm">{t('identifyHint')}</p>
        )}
        {result.kind === 'note' && (
          <button
            type="button"
            onClick={play}
            aria-label={t('play', { chord: result.notes[0] ?? '' })}
            className="text-left font-bold font-display text-5xl text-chord"
          >
            {result.notes[0]}
          </button>
        )}
        {result.kind === 'interval' && (
          <>
            <button
              type="button"
              onClick={play}
              aria-label={t('play', { chord: t(`intervals.${result.semitones}` as 'intervals.1') })}
              className="text-left font-bold font-display text-3xl"
            >
              {t(`intervals.${result.semitones}` as 'intervals.1')}
            </button>
            {result.names.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {result.names.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold text-sm"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {result.kind === 'chord' && (
          <>
            <button
              type="button"
              onClick={play}
              aria-label={t('play', { chord: result.names[0] ?? '' })}
              className="text-left font-bold font-display text-5xl text-chord"
            >
              {result.names[0]}
            </button>
            {result.names.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {result.names.slice(1).map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-surface-2 px-2.5 py-0.5 font-semibold text-sm"
                  >
                    {name}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
        {result.kind === 'unknown' && (
          <div className="flex items-center gap-2">
            <p className="font-semibold text-lg">{t('unknown')}</p>
            <button
              type="button"
              onClick={play}
              aria-label={t('play', { chord: result.notes.join(' ') })}
              className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-2"
            >
              <Play className="size-3.5 fill-current" />
            </button>
          </div>
        )}
        {result.kind !== 'empty' && (
          <p className="text-muted-foreground text-sm">
            {t('notes', { notes: result.notes.join(' ') })}
          </p>
        )}
        <Button
          variant="outline"
          className="self-start"
          disabled={result.kind === 'empty'}
          onClick={clear}
        >
          <Eraser />
          {t('clear')}
        </Button>
      </div>
    </div>
  );
}
