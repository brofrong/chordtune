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
          <button
            type="button"
            onClick={play}
            className="text-left font-bold font-display text-5xl text-chord"
          >
            {result.notes[0]}
          </button>
        )}
        {result.kind === 'interval' && (
          <button
            type="button"
            onClick={play}
            className="text-left font-bold font-display text-3xl"
          >
            {t(`intervals.${result.semitones}` as 'intervals.1')}
          </button>
        )}
        {result.kind === 'chord' && (
          <>
            <button
              type="button"
              onClick={play}
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
        {result.kind === 'unknown' && <p className="font-semibold text-lg">{t('unknown')}</p>}
        {result.kind !== 'empty' && (
          <p className="text-muted-foreground text-sm">
            {t('notes', { notes: result.notes.join(' ') })}
          </p>
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
