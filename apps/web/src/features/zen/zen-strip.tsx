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
