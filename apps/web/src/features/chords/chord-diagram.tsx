import { cn } from '@/lib/utils';
import { diagramLayout } from './diagram-layout';

// `left` leaves room for a two-digit base-fret label: its right edge sits at `left - dot - 2`,
// and two digits at `font` px run about `1.2 * font` wide, so `left` needs to clear
// `1.2 * font + dot + 2` plus a pixel of breathing room.
const SIZES = {
  sm: { gap: 11, row: 13, dot: 4, font: 8, left: 17 },
  md: { gap: 15, row: 18, dot: 5.5, font: 10, left: 21 },
} as const;
const TOP = 12;

/** A chord box: strings, five frets, the nut or the first fret's number, `×`/`o`, dots, barre. */
export function ChordDiagram({
  frets,
  size = 'md',
  className,
}: {
  frets: readonly (number | null)[];
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { gap, row, dot, font, left } = SIZES[size];
  const layout = diagramLayout(frets);
  const strings = frets.length;
  const x = (string: number) => left + string * gap;
  const y = (line: number) => TOP + line * row;
  const width = x(strings - 1) + 6;
  const height = y(layout.rows) + 4;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('text-foreground', className)}
    >
      {layout.base > 1 && (
        <text
          x={left - dot - 2}
          y={y(0.5) + font / 3}
          textAnchor="end"
          fontSize={font}
          className="fill-muted-foreground"
        >
          {layout.base}
        </text>
      )}
      <line
        x1={x(0)}
        x2={x(strings - 1)}
        y1={y(0)}
        y2={y(0)}
        stroke="currentColor"
        strokeWidth={layout.base === 1 ? 3 : 1}
      />
      {Array.from({ length: layout.rows }, (_, i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: frets are positional
          key={i}
          x1={x(0)}
          x2={x(strings - 1)}
          y1={y(i + 1)}
          y2={y(i + 1)}
          stroke="currentColor"
          strokeOpacity={0.35}
        />
      ))}
      {Array.from({ length: strings }, (_, string) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: strings are positional
          key={string}
          x1={x(string)}
          x2={x(string)}
          y1={y(0)}
          y2={y(layout.rows)}
          stroke="currentColor"
          strokeOpacity={0.6}
        />
      ))}
      {layout.open.map((string) => (
        <circle
          key={`o${string}`}
          cx={x(string)}
          cy={TOP - dot - 1}
          r={dot * 0.6}
          fill="none"
          stroke="currentColor"
        />
      ))}
      {layout.muted.map((string) => (
        <text
          key={`x${string}`}
          x={x(string)}
          y={TOP - 3}
          textAnchor="middle"
          fontSize={font}
          className="fill-muted-foreground"
        >
          ×
        </text>
      ))}
      {layout.barre && (
        <rect
          x={x(layout.barre.from) - dot}
          y={y(layout.barre.fret - 0.5) - dot}
          width={x(layout.barre.to) - x(layout.barre.from) + dot * 2}
          height={dot * 2}
          rx={dot}
          className="fill-chord"
        />
      )}
      {layout.dots.map(({ string, fret }) => (
        <circle
          key={`d${string}`}
          cx={x(string)}
          cy={y(fret - 0.5)}
          r={dot}
          className="fill-chord"
        />
      ))}
    </svg>
  );
}
