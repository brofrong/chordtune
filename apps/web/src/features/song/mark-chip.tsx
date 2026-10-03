import type { Item } from '@chordtune/chord-sheet';
import type * as React from 'react';

import { rhythmColor } from '@/features/rhythm/rhythm-colors';
import { cn } from '@/lib/utils';

type MarkItem = Exclude<Item, { type: 'text' }>;

/** A chord, bar line, rhythm marker or repeat drawn above the lyrics. */
export function MarkChip({
  item,
  active,
  onClick,
  className,
}: {
  item: MarkItem;
  active?: boolean;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
  className?: string;
}) {
  switch (item.type) {
    case 'chord': {
      const classes = cn(
        'rounded px-0.5 font-semibold text-chord leading-5 transition-colors',
        active && 'bg-chord text-background',
        onClick && 'cursor-pointer hover:bg-chord/15',
        className,
      );
      return onClick ? (
        <button type="button" className={classes} onClick={onClick}>
          {item.chord}
        </button>
      ) : (
        <span className={classes}>{item.chord}</span>
      );
    }
    case 'bar':
      return (
        <span className={cn('mx-0.5 h-5 w-px self-center bg-muted-foreground/60', className)} />
      );
    case 'rhythm':
      return (
        <span
          className={cn(
            'rounded px-1 font-mono font-semibold text-xs leading-5 ring-1',
            rhythmColor(item.key),
            className,
          )}
        >
          {item.key}
        </span>
      );
    case 'repeat':
      return (
        <span className={cn('px-0.5 font-mono text-muted-foreground text-xs leading-5', className)}>
          ×{item.times}
        </span>
      );
  }
}
