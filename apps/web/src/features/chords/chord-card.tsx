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
  const label = browser.label(chord);
  const step = (delta: number) =>
    browser.setIndex(chord, (index + delta + variants.length) % variants.length);

  return (
    <div
      className={cn(
        'flex shrink-0 flex-col items-center gap-0.5 rounded-2xl border border-border bg-surface px-2 pt-1.5 pb-1',
        className,
      )}
    >
      <span className="font-semibold text-chord text-sm">{label}</span>
      {shape ? (
        <button
          type="button"
          aria-label={t('play', { chord: label })}
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
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={t('previous')}
            onClick={() => step(-1)}
          >
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
