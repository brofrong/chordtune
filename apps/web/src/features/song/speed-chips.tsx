'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5] as const;

export function formatSpeed(speed: number): string {
  return `${speed}×`;
}

/** Playback speed of the whole song: tempo and bars stay, time runs faster or slower. */
export function SpeedChips({
  speed,
  onChange,
  className,
}: {
  speed: number;
  onChange: (speed: number) => void;
  className?: string;
}) {
  const t = useTranslations('song');
  return (
    <div role="radiogroup" aria-label={t('speed')} className={cn('flex gap-1', className)}>
      {SPEEDS.map((value) => (
        // biome-ignore lint/a11y/useSemanticElements: a styled toggle reads better as a button than <input type="radio">
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={value === speed}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-full px-2 py-0.5 font-semibold text-xs tabular-nums transition-colors',
            value === speed
              ? 'bg-primary text-primary-foreground'
              : 'bg-surface-2 text-muted-foreground',
          )}
        >
          {formatSpeed(value)}
        </button>
      ))}
    </div>
  );
}
