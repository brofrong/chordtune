'use client';

import { midiToHz, midiToNoteName, type Tuning } from '@chordtune/audio';
import { playReferenceTone } from '@chordtune/audio/browser';
import { Check } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import type { TuneZone } from './reading';

const ZONE_RING: Record<TuneZone, string> = {
  in: 'border-tune-in text-tune-in',
  near: 'border-tune-near text-tune-near',
  off: 'border-tune-off text-tune-off',
};

export function StringRow({
  tuning,
  a4,
  activeIndex,
  zone,
  lockedIndex,
  tuned,
  onLock,
}: {
  tuning: Tuning;
  a4: number;
  activeIndex: number | null;
  zone: TuneZone | null;
  lockedIndex: number | null;
  tuned: ReadonlySet<number>;
  onLock: (index: number | null) => void;
}) {
  const t = useTranslations('tuner');

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center justify-center gap-2">
        {tuning.strings.map((midi, index) => {
          const { name, octave } = midiToNoteName(midi);
          const active = activeIndex === index && zone != null;
          const locked = lockedIndex === index;
          const isTuned = tuned.has(index);
          return (
            <motion.button
              // biome-ignore lint/suspicious/noArrayIndexKey: strings are positional and can repeat a note
              key={index}
              type="button"
              whileTap={{ scale: 0.92 }}
              aria-pressed={locked}
              aria-label={t('playTone', { note: `${name}${octave}` })}
              onClick={() => {
                onLock(locked ? null : index);
                if (!locked) {
                  void playReferenceTone(midiToHz(midi, a4));
                }
              }}
              className={cn(
                'relative flex size-12 items-baseline justify-center rounded-full border pt-3 font-semibold text-lg transition-colors',
                active && zone ? ZONE_RING[zone] : 'border-border text-foreground',
                locked && 'bg-muted ring-2 ring-primary/60 ring-offset-2 ring-offset-background',
              )}
            >
              {name}
              <span className="font-normal text-[10px] text-muted-foreground">{octave}</span>
              {isTuned && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="-top-1 -right-1 absolute grid size-5 place-items-center rounded-full bg-tune-in text-background"
                >
                  <Check className="size-3" strokeWidth={3} />
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>
      <button
        type="button"
        aria-pressed={lockedIndex == null}
        onClick={() => onLock(null)}
        className={cn(
          'h-7 rounded-full border px-3 text-xs transition-colors',
          lockedIndex == null
            ? 'border-primary/60 bg-primary/10 text-primary'
            : 'border-border text-muted-foreground hover:text-foreground',
        )}
      >
        {t('auto')}
      </button>
    </div>
  );
}
