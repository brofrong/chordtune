'use client';

import type { Shape } from '@chordtune/chord-sheet';
import { ChevronDown, ChevronUp, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import type { SongSound } from '@/features/rhythm/playback';
import { cn } from '@/lib/utils';
import { ChordCard } from './chord-card';
import { chordVariants } from './chord-variants';

/** The panel shows at most this many of the song's chords; a huge song still renders fast. */
export const MAX_PANEL_CHORDS = 64;

export type ChordBrowser = {
  chords: string[];
  variants: (chord: string) => Shape[];
  index: (chord: string) => number;
  setIndex: (chord: string, index: number) => void;
  /** The chord as the song spells it (`Hm`), not the normalised key used everywhere else. */
  label: (chord: string) => string;
};

/** Every chord's shapes and which one is shown, shared by the panel and the popover. */
export function useChordBrowser(
  chords: string[],
  sound: SongSound,
  spellings: Map<string, string>,
): ChordBrowser {
  const [shown, setShown] = useState<Record<string, number>>({});
  const { strings } = sound.tuning;
  const { voicings } = sound;
  // A chord's variants are searched only once it is actually shown (a card or a popover),
  // not for every chord in the song up front — a search is too slow to run thousands of times
  // eagerly, including on the server for the song page's first render.
  const cache = useRef(new Map<string, Shape[]>());
  const deps = useRef({ strings, voicings });
  if (deps.current.strings !== strings || deps.current.voicings !== voicings) {
    cache.current = new Map();
    deps.current = { strings, voicings };
  }

  return {
    chords: chords.slice(0, MAX_PANEL_CHORDS),
    variants: (chord) => {
      const found = cache.current.get(chord);
      if (found) {
        return found;
      }
      const computed = chordVariants(chord, strings, voicings[chord]);
      cache.current.set(chord, computed);
      return computed;
    },
    index: (chord) => shown[chord] ?? 0,
    setIndex: (chord, index) => setShown((current) => ({ ...current, [chord]: index })),
    label: (chord) => spellings.get(chord) ?? chord,
  };
}

type PanelProps = {
  browser: ChordBrowser;
  onPlay: (shape: Shape) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Wide screens: a column of chords to the right of the song that stays in view. */
export function ChordSidebar({ browser, onPlay, open, onOpenChange }: PanelProps) {
  const t = useTranslations('chords');
  if (browser.chords.length === 0) {
    return null;
  }
  return (
    <aside className="sticky top-[4.25rem] hidden max-h-[calc(100dvh-5.25rem)] shrink-0 self-start pt-4 lg:block">
      {open ? (
        <div className="flex w-56 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground text-xs uppercase tracking-wide">{t('title')}</h2>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t('hide')}
              onClick={() => onOpenChange(false)}
            >
              <PanelRightClose />
            </Button>
          </div>
          <div className="grid max-h-[calc(100dvh-8rem)] grid-cols-2 gap-2 overflow-y-auto pb-2">
            {browser.chords.map((chord) => (
              <ChordCard key={chord} chord={chord} browser={browser} onPlay={onPlay} size="sm" />
            ))}
          </div>
        </div>
      ) : (
        <button
          type="button"
          aria-label={t('show')}
          onClick={() => onOpenChange(true)}
          className="flex flex-col items-center gap-2 rounded-xl bg-surface px-1.5 py-3 text-muted-foreground text-xs"
        >
          <PanelRightOpen className="size-4" />
          <span className="[writing-mode:vertical-rl]">{t('title')}</span>
        </button>
      )}
    </aside>
  );
}

/** Phones: a strip of chord cards under the title that scrolls sideways or folds into names. */
export function ChordStrip({
  browser,
  onPlay,
  open,
  onOpenChange,
  className,
}: PanelProps & {
  className?: string;
}) {
  const t = useTranslations('chords');
  if (browser.chords.length === 0) {
    return null;
  }
  return (
    <section className={cn('flex flex-col gap-1', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-label={open ? t('hide') : t('show')}
        onClick={() => onOpenChange(!open)}
        className="flex items-center gap-2 text-left text-muted-foreground text-xs"
      >
        <span className="uppercase tracking-wide">{t('title')}</span>
        {!open && (
          <span className="min-w-0 truncate font-semibold text-chord text-sm normal-case">
            {browser.chords.join(' ')}
          </span>
        )}
        {open ? (
          <ChevronUp className="ml-auto size-4" />
        ) : (
          <ChevronDown className="ml-auto size-4" />
        )}
      </button>
      {open && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {browser.chords.map((chord) => (
            <ChordCard key={chord} chord={chord} browser={browser} onPlay={onPlay} size="sm" />
          ))}
        </div>
      )}
    </section>
  );
}
