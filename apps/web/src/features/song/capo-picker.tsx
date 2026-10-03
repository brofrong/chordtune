'use client';

import type { CapoHint } from '@chordtune/audio';
import { Check, ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

const FRETS = Array.from({ length: 13 }, (_, fret) => fret);

/** «Каподастр: 3 лад ▾» — the listener's capo, with ★ on easy frets and «как у автора». */
export function CapoPicker({
  value,
  authorCapo,
  hints,
  onChange,
}: {
  value: number;
  authorCapo: number;
  /** Computed when the list opens: it runs the voicing search for every fret. */
  hints: () => CapoHint[];
  onChange: (capo: number | null) => void;
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
        <ChevronDown className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0.5 p-1.5">
        <CapoList value={value} authorCapo={authorCapo} hints={hints} onChange={onChange} />
      </PopoverContent>
    </Popover>
  );
}

function CapoList({
  value,
  authorCapo,
  hints,
  onChange,
}: {
  value: number;
  authorCapo: number;
  hints: () => CapoHint[];
  onChange: (capo: number | null) => void;
}) {
  const t = useTranslations('song');
  const byFret = new Map(hints().map((hint) => [hint.capo, hint]));
  return (
    <>
      <button
        type="button"
        onClick={() => onChange(null)}
        className="rounded-md px-2 py-1.5 text-left text-muted-foreground text-sm hover:bg-surface-2"
      >
        {t('capoAsAuthor')}
      </button>
      {FRETS.map((fret) => {
        const hint = byFret.get(fret);
        return (
          <button
            key={fret}
            type="button"
            aria-pressed={fret === value}
            onClick={() => onChange(fret)}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2"
          >
            <span className="w-4">{fret === value && <Check className="size-3.5" />}</span>
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
