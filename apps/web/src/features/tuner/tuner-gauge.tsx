'use client';

import { type MotionValue, motion, useTransform } from 'motion/react';

import { cn } from '@/lib/utils';

import { GAUGE_RANGE_CENTS, IN_TUNE_CENTS, NEAR_CENTS, type TuneZone } from './reading';

const COLORS = { in: '#4ade80', near: '#fbbf24', off: '#f87171', idle: '#6b7280' };
const WIDTH = 320;
const HEIGHT = 180;
const CX = WIDTH / 2;
const CY = 168;
const RADIUS = 146;
const SWEEP_DEG = 62;

function polar(cents: number, radius: number) {
  const clamped = Math.max(-GAUGE_RANGE_CENTS, Math.min(GAUGE_RANGE_CENTS, cents));
  const angle = ((clamped / GAUGE_RANGE_CENTS) * SWEEP_DEG * Math.PI) / 180;
  return { x: CX + radius * Math.sin(angle), y: CY - radius * Math.cos(angle) };
}

function arcPath(fromCents: number, toCents: number, radius: number) {
  const from = polar(fromCents, radius);
  const to = polar(toCents, radius);
  return `M ${from.x} ${from.y} A ${radius} ${radius} 0 0 1 ${to.x} ${to.y}`;
}

const TICKS = Array.from(
  { length: (2 * GAUGE_RANGE_CENTS) / 5 + 1 },
  (_, i) => i * 5 - GAUGE_RANGE_CENTS,
);

export function TunerGauge({
  cents,
  zone,
  active,
}: {
  cents: MotionValue<number>;
  zone: TuneZone | null;
  active: boolean;
}) {
  // A short pointer along the rim keeps the centre free for the note name.
  const x1 = useTransform(cents, (value) => polar(value, RADIUS - 58).x);
  const y1 = useTransform(cents, (value) => polar(value, RADIUS - 58).y);
  const x2 = useTransform(cents, (value) => polar(value, RADIUS - 4).x);
  const y2 = useTransform(cents, (value) => polar(value, RADIUS - 4).y);
  const color = useTransform(
    cents,
    [-GAUGE_RANGE_CENTS, -NEAR_CENTS, -IN_TUNE_CENTS, IN_TUNE_CENTS, NEAR_CENTS, GAUGE_RANGE_CENTS],
    [COLORS.off, COLORS.near, COLORS.in, COLORS.in, COLORS.near, COLORS.off],
  );
  const needleColor = active ? color : COLORS.idle;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full max-w-md overflow-visible"
      role="img"
      aria-hidden
    >
      <path
        d={arcPath(-GAUGE_RANGE_CENTS, GAUGE_RANGE_CENTS, RADIUS)}
        className="fill-none stroke-border"
        strokeWidth={2}
      />
      <motion.path
        d={arcPath(-IN_TUNE_CENTS, IN_TUNE_CENTS, RADIUS)}
        fill="none"
        stroke={COLORS.in}
        strokeLinecap="round"
        animate={{ strokeWidth: zone === 'in' && active ? 10 : 6, opacity: active ? 1 : 0.35 }}
        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      />
      {TICKS.map((value) => {
        const major = value % 10 === 0;
        const outer = polar(value, RADIUS - 8);
        const inner = polar(value, RADIUS - (value === 0 ? 30 : major ? 22 : 15));
        return (
          <line
            key={value}
            x1={outer.x}
            y1={outer.y}
            x2={inner.x}
            y2={inner.y}
            className={cn(
              value === 0 ? 'stroke-foreground' : 'stroke-muted-foreground',
              !major && 'opacity-50',
            )}
            strokeWidth={value === 0 ? 3 : major ? 2 : 1.25}
            strokeLinecap="round"
          />
        );
      })}
      {[-GAUGE_RANGE_CENTS, GAUGE_RANGE_CENTS].map((value) => {
        const point = polar(value, RADIUS + 14);
        return (
          <text
            key={value}
            x={point.x}
            y={point.y}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[11px]"
          >
            {value > 0 ? `+${value}` : value}
          </text>
        );
      })}
      <motion.line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={needleColor}
        strokeWidth={5}
        strokeLinecap="round"
        style={{ opacity: active ? 1 : 0.4 }}
      />
    </svg>
  );
}
