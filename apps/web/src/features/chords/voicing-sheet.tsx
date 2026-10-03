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
    if (player.playing === 'shape') {
      player.stop();
    }
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
                <Button
                  variant="outline"
                  onClick={() => play(drawing)}
                  disabled={check?.kind === 'empty'}
                >
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
                {variants.map((shape, index) => {
                  const id = shape.join();
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={id === selected}
                      aria-label={t('variant', { chord: chord ?? '', n: index + 1 })}
                      onClick={() => {
                        play(shape);
                        // Tapping the already-shown default with no own shape yet is just
                        // listening, not picking: nothing changed, so don't store it as one.
                        if (own || id !== variants[0]?.join()) {
                          onPick(shape);
                        }
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
                  onClick={() => setDrawing([...(own ?? variants[0] ?? strings.map(() => null))])}
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
