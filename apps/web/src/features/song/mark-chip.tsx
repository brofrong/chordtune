import type { Item } from '@chordtune/chord-sheet';

import { rhythmColor } from '@/features/rhythm/rhythm-colors';
import { cn } from '@/lib/utils';

type MarkItem = Exclude<Item, { type: 'text' }>;

/** A chord, bar line, rhythm marker or repeat drawn above the lyrics. */
export function MarkChip({
  item,
  active,
  className,
}: {
  item: MarkItem;
  active?: boolean;
  className?: string;
}) {
  switch (item.type) {
    case 'chord':
      return (
        <span
          className={cn(
            'rounded px-0.5 font-semibold text-primary leading-5 transition-colors',
            active && 'bg-primary text-primary-foreground',
            className,
          )}
        >
          {item.chord}
        </span>
      );
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
