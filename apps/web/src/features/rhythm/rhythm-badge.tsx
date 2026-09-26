import type { Rhythm } from '@chordtune/chord-sheet';

import { cn } from '@/lib/utils';
import { rhythmColor } from './rhythm-colors';
import { RhythmStrip } from './rhythm-strip';

/** `A Шестёрка ↓·↓↑·↑↓↑` — key badge, optionally with the name and pattern. */
export function RhythmBadge({
  rhythmKey,
  rhythm,
  showPattern = false,
  className,
}: {
  rhythmKey: string;
  rhythm?: Rhythm;
  showPattern?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'rounded px-1.5 font-mono font-semibold text-xs leading-5 ring-1',
          rhythmColor(rhythmKey),
        )}
      >
        {rhythmKey}
      </span>
      {showPattern && rhythm && (
        <>
          <span className="text-muted-foreground text-xs">{rhythm.name}</span>
          <RhythmStrip rhythm={rhythm} className="text-xs" />
        </>
      )}
    </span>
  );
}
