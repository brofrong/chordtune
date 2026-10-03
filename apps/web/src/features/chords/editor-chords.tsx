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
