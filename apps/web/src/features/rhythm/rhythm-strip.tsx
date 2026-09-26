import { type Rhythm, strumSymbols } from '@chordtune/chord-sheet';

import { cn } from '@/lib/utils';

/** `↓ · ↓ ↑` for strums, `Б 3 2 3` for picking; accented steps are brighter. */
export function RhythmStrip({
  rhythm,
  activeStep,
  className,
}: {
  rhythm: Pick<Rhythm, 'kind' | 'steps'>;
  activeStep?: number | null;
  className?: string;
}) {
  const symbols = strumSymbols(rhythm);
  return (
    <span className={cn('inline-flex gap-0.5 font-mono text-sm leading-none', className)}>
      {symbols.map((symbol, index) => (
        <span
          // Steps have no identity besides their position.
          // biome-ignore lint/suspicious/noArrayIndexKey: position is the identity
          key={index}
          className={cn(
            'min-w-[1ch] text-center text-muted-foreground',
            rhythm.steps[index]?.accent && 'font-bold text-foreground',
            activeStep === index && 'text-primary',
          )}
        >
          {symbol}
        </span>
      ))}
    </span>
  );
}
