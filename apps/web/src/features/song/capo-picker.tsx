'use client';

import type { CapoHint } from '@chordtune/audio';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const FRETS = Array.from({ length: 13 }, (_, fret) => fret);

/** «Каподастр: 3 лад ▾» — the listener's capo, with ★ on easy frets and «как у автора». */
export function CapoPicker({
  value,
  authorCapo,
  followsAuthor,
  hints,
  onChange,
  layerClassName,
}: {
  value: number;
  authorCapo: number;
  /** The listener has no capo choice of their own: the song follows the author's capo. */
  followsAuthor: boolean;
  /** Computed when the list opens: it runs the voicing search for every fret. */
  hints: () => CapoHint[];
  onChange: (capo: number | null) => void;
  /** The list's stacking layer, when the picker sits on something above the page (zen). */
  layerClassName?: string;
}) {
  const t = useTranslations('song');
  const label = value === 0 ? t('capoNone') : t('capo', { fret: value });
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          'inline-flex items-center gap-1 rounded-md',
          value !== authorCapo && 'font-semibold text-chord',
        )}
      >
        {label}
        <ChevronDown aria-hidden className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 gap-0.5 p-1.5"
        positionerClassName={layerClassName}
      >
        <CapoList
          value={value}
          authorCapo={authorCapo}
          followsAuthor={followsAuthor}
          hints={hints}
          onChange={onChange}
        />
      </PopoverContent>
    </Popover>
  );
}

function CapoList({
  value,
  authorCapo,
  followsAuthor,
  hints,
  onChange,
}: {
  value: number;
  authorCapo: number;
  followsAuthor: boolean;
  hints: () => CapoHint[];
  onChange: (capo: number | null) => void;
}) {
  const t = useTranslations('song');
  // `CapoList` mounts only while the popover is open, so this lazy initial state runs the
  // voicing search once per opening, not on every re-render of the song page underneath.
  const [byFret] = useState(() => new Map(hints().map((hint) => [hint.capo, hint])));
  return (
    <>
      <button
        type="button"
        aria-pressed={followsAuthor}
        onClick={() => onChange(null)}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-surface-2"
      >
        <span className="w-4">{followsAuthor && <Check aria-hidden className="size-3.5" />}</span>
        <span className="flex-1">{t('capoAsAuthor')}</span>
      </button>
      {FRETS.map((fret) => {
        const hint = byFret.get(fret);
        return (
          <button
            key={fret}
            type="button"
            aria-pressed={!followsAuthor && fret === value}
            onClick={() => onChange(fret)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            <span className="w-4">
              {!followsAuthor && fret === value && <Check aria-hidden className="size-3.5" />}
            </span>
            <span className="flex-1">{fret === 0 ? t('capoNone') : t('capoFret', { fret })}</span>
            {fret === authorCapo && (
              <span className="text-muted-foreground text-xs">{t('capoAuthor')}</span>
            )}
            {hint?.noBarre && <span className="text-muted-foreground text-xs">{t('noBarre')}</span>}
            {hint?.star && <span className="text-chord">★</span>}
          </button>
        );
      })}
    </>
  );
}
