'use client';

import type { TabBar, TabBeat, TabBlock, TabNote } from '@chordtune/chord-sheet';
import { useLayoutEffect, useRef, useState } from 'react';

import type { ActiveBeat } from '@/features/rhythm/playback';
import { cn } from '@/lib/utils';
import {
  type BeatLayout,
  beamGroups,
  layoutTab,
  type RowLayout,
  tabBeatQuarters,
} from './tab-layout';

const STRING_GAP = 10;
const TEXT_Y = 9;
const MARK_Y = 21;
const TOP = 32;
const STAFF = STRING_GAP * 5;
const RHYTHM_TOP = TOP + STAFF + 8;
const STEM = 16;
const LYRICS_Y = RHYTHM_TOP + STEM + 16;
const DEFAULT_WIDTH = 320;

const stringY = (string: number) => TOP + (string - 1) * STRING_GAP;
const beamCount = (duration: number) => Math.max(0, Math.log2(duration / 4));

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    setWidth(element.clientWidth || DEFAULT_WIDTH);
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width || DEFAULT_WIDTH);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A tab block as tablature: six strings, rhythm under them, text above, lyrics below. */
export function TabStaff({
  block,
  activeBeat = null,
  className,
}: {
  block: TabBlock;
  activeBeat?: ActiveBeat | null;
  className?: string;
}) {
  const [ref, width] = useWidth();
  const rows = layoutTab(block, width);
  const hasLyrics = block.bars.some((bar) => bar.beats.some((beat) => beat.syllable));
  const height = hasLyrics ? LYRICS_Y + 6 : RHYTHM_TOP + STEM + 6;

  return (
    <div ref={ref} className={cn('flex flex-col gap-3 overflow-x-auto', className)}>
      {rows.map((row) => {
        const first = row.bars[0]?.index ?? 0;
        const active =
          activeBeat !== null &&
          row.beats.some((b) => b.bar === activeBeat.bar && b.beat === activeBeat.beat);
        return (
          <div
            key={first}
            data-active-row={active || undefined}
            // The row's start, in quarter notes from the block's start (as drawn, repeats
            // ignored) — zen mode reads this to glide smoothly from row to row.
            data-row-start-beat={tabBeatQuarters(block, first)}
          >
            <svg width={row.width} height={height} className="block overflow-visible" aria-hidden>
              <Row block={block} row={row} activeBeat={activeBeat} />
            </svg>
          </div>
        );
      })}
    </div>
  );
}

function Row({
  block,
  row,
  activeBeat,
}: {
  block: TabBlock;
  row: RowLayout;
  activeBeat: ActiveBeat | null;
}) {
  const beatOf = (layout: BeatLayout) => block.bars[layout.bar]?.beats[layout.beat];
  const beamed = new Set(beamGroups(block, row).flat());

  return (
    <g>
      {[1, 2, 3, 4, 5, 6].map((string) => (
        <line
          key={string}
          x1={0}
          x2={row.width}
          y1={stringY(string)}
          y2={stringY(string)}
          className="stroke-border"
        />
      ))}
      {row.bars.map((bar) => (
        <BarLines key={bar.index} bar={block.bars[bar.index]} x={bar.x} width={bar.width} />
      ))}
      <line
        x1={row.width}
        x2={row.width}
        y1={TOP}
        y2={TOP + STAFF}
        className="stroke-muted-foreground"
      />
      <Runs row={row} beatOf={beatOf} />
      {row.beats.map((layout, index) => {
        const beat = beatOf(layout);
        if (!beat) {
          return null;
        }
        const following = row.beats.slice(index + 1);
        return (
          <Beat
            key={`${layout.bar}:${layout.beat}`}
            beat={beat}
            layout={layout}
            active={activeBeat?.bar === layout.bar && activeBeat.beat === layout.beat}
            beamed={beamed.has(layout)}
            target={(note) => {
              for (const next of following) {
                const found = beatOf(next)?.notes.find((other) => other.string === note.string);
                if (found) {
                  return { layout: next, note: found };
                }
              }
              return null;
            }}
          />
        );
      })}
      {beamGroups(block, row).map((group) => (
        <Beams key={`${group[0]?.bar}:${group[0]?.beat}`} group={group} beatOf={beatOf} />
      ))}
    </g>
  );
}

function BarLines({ bar, x, width }: { bar: TabBar | undefined; x: number; width: number }) {
  const dots = (dx: number) =>
    [2.5, 4.5].map((string) => (
      <circle key={string} cx={dx} cy={stringY(string)} r={1.8} className="fill-muted-foreground" />
    ));
  return (
    <g className="stroke-muted-foreground">
      <line x1={x} x2={x} y1={TOP} y2={TOP + STAFF} />
      {bar?.repeatOpen && (
        <g>
          <rect x={x + 1} y={TOP} width={2.5} height={STAFF} className="fill-muted-foreground" />
          {dots(x + 8)}
        </g>
      )}
      {bar?.repeatClose !== null && bar?.repeatClose !== undefined && (
        <g>
          {dots(x + width - 8)}
          <rect
            x={x + width - 3.5}
            y={TOP}
            width={2.5}
            height={STAFF}
            className="fill-muted-foreground"
          />
          <text
            x={x + width - 2}
            y={MARK_Y}
            textAnchor="end"
            className="fill-muted-foreground stroke-none text-[10px]"
          >
            ×{bar.repeatClose}
          </text>
        </g>
      )}
    </g>
  );
}

/** «P.M.» and «let ring» over runs of beats, with a dashed line to the end of the run. */
function Runs({
  row,
  beatOf,
}: {
  row: RowLayout;
  beatOf: (layout: BeatLayout) => TabBeat | undefined;
}) {
  const runs = (flag: 'palmMute' | 'letRing') => {
    const result: BeatLayout[][] = [];
    for (const layout of row.beats) {
      if (!beatOf(layout)?.[flag]) {
        continue;
      }
      const last = result.at(-1);
      const previous = last?.at(-1);
      if (last && previous && row.beats.indexOf(previous) === row.beats.indexOf(layout) - 1) {
        last.push(layout);
      } else {
        result.push([layout]);
      }
    }
    return result;
  };
  const draw = (label: string, run: BeatLayout[]) => {
    const first = run[0];
    const last = run.at(-1);
    if (!first || !last) {
      return null;
    }
    return (
      <g key={`${label}:${first.bar}:${first.beat}`}>
        <text x={first.x - 6} y={MARK_Y} className="fill-muted-foreground text-[9px]">
          {label}
        </text>
        {last !== first && (
          <line
            x1={first.x + 18}
            x2={last.x + 4}
            y1={MARK_Y - 3}
            y2={MARK_Y - 3}
            strokeDasharray="3 3"
            className="stroke-muted-foreground"
          />
        )}
      </g>
    );
  };
  return (
    <g>
      {runs('palmMute').map((run) => draw('P.M.', run))}
      {runs('letRing').map((run) => draw('let ring', run))}
    </g>
  );
}

function Beat({
  beat,
  layout,
  active,
  beamed,
  target,
}: {
  beat: TabBeat;
  layout: BeatLayout;
  active: boolean;
  beamed: boolean;
  target: (note: TabNote) => { layout: BeatLayout; note: TabNote } | null;
}) {
  const { x } = layout;
  return (
    <g>
      {active && (
        <rect
          x={x - layout.width / 2}
          y={TOP - 7}
          width={layout.width}
          height={STAFF + 14}
          rx={4}
          className="fill-primary/20"
        />
      )}
      {beat.text && (
        <text x={x} y={TEXT_Y} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          {beat.text}
        </text>
      )}
      {beat.notes.map((note) => (
        <NoteMark key={note.string} note={note} x={x} active={active} target={target(note)} />
      ))}
      <Rhythm beat={beat} x={x} beamed={beamed} />
      {beat.syllable && (
        <text x={x} y={LYRICS_Y} textAnchor="middle" className="fill-foreground text-[12px]">
          {beat.syllable}
        </text>
      )}
    </g>
  );
}

function NoteMark({
  note,
  x,
  active,
  target,
}: {
  note: TabNote;
  x: number;
  active: boolean;
  target: { layout: BeatLayout; note: TabNote } | null;
}) {
  const y = stringY(note.string);
  const label = note.unreachable
    ? '?'
    : note.fret === 'x'
      ? 'x'
      : note.tie
        ? `(${note.fret})`
        : String(note.fret);
  const up =
    target && typeof target.note.fret === 'number' && typeof note.fret === 'number'
      ? target.note.fret > note.fret
      : true;
  const bend = note.effects.bend ? Math.max(...note.effects.bend) : 0;
  return (
    <g>
      {note.effects.hammer && target && (
        <g className="fill-none stroke-muted-foreground">
          <path
            d={`M ${x + 4} ${y - 6} Q ${(x + target.layout.x) / 2} ${y - 14} ${target.layout.x - 4} ${y - 6}`}
          />
          <text
            x={(x + target.layout.x) / 2}
            y={y - 12}
            textAnchor="middle"
            className="fill-muted-foreground stroke-none text-[9px]"
          >
            {up ? 'h' : 'p'}
          </text>
        </g>
      )}
      {note.effects.slide && target && (
        <line
          x1={x + 7}
          x2={target.layout.x - 7}
          y1={y + (up ? 3 : -3)}
          y2={y + (up ? -3 : 3)}
          className="stroke-muted-foreground"
        />
      )}
      {bend > 0 && (
        <g className="fill-none stroke-muted-foreground">
          <path d={`M ${x + 7} ${y} Q ${x + 14} ${y} ${x + 14} ${TOP - 4}`} />
          <path d={`M ${x + 11} ${TOP - 1} L ${x + 14} ${TOP - 6} L ${x + 17} ${TOP - 1}`} />
          <text
            x={x + 14}
            y={TOP - 8}
            textAnchor="middle"
            className="fill-muted-foreground stroke-none text-[9px]"
          >
            {bend === 2 ? '½' : bend === 4 ? 'full' : String(bend / 4)}
          </text>
        </g>
      )}
      {note.effects.vibrato && (
        <path
          d={`M ${x - 6} ${y - 9} q 2 -3 4 0 t 4 0 t 4 0`}
          className="fill-none stroke-muted-foreground"
        />
      )}
      <text
        x={x}
        y={y}
        dy="0.35em"
        textAnchor="middle"
        paintOrder="stroke"
        className={cn(
          'stroke-[4px] stroke-background font-mono text-[11px]',
          note.unreachable ? 'fill-destructive' : active ? 'fill-primary' : 'fill-foreground',
        )}
      >
        {label}
      </text>
    </g>
  );
}

function Rhythm({ beat, x, beamed }: { beat: TabBeat; x: number; beamed: boolean }) {
  const bottom = RHYTHM_TOP + STEM;
  if (beat.notes.length === 0) {
    return (
      <path
        d={`M ${x - 2} ${RHYTHM_TOP + 2} l 4 4 l -4 4 l 4 4`}
        className="fill-none stroke-muted-foreground"
      />
    );
  }
  if (beat.duration === 1) {
    return null;
  }
  const top = beat.duration === 2 ? RHYTHM_TOP + STEM / 2 : RHYTHM_TOP;
  const flags = beamed ? 0 : beamCount(beat.duration);
  return (
    <g className="stroke-muted-foreground">
      <line x1={x} x2={x} y1={top} y2={bottom} />
      {Array.from({ length: flags }, (_, i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: flags are positional
          key={i}
          x1={x}
          x2={x + 5}
          y1={bottom - i * 4}
          y2={bottom - i * 4 - 5}
        />
      ))}
      {beat.dotted && (
        <circle cx={x + 4} cy={bottom - 2} r={1.5} className="fill-muted-foreground" />
      )}
      {beat.tuplet && !beamed && (
        <text
          x={x}
          y={bottom + 10}
          textAnchor="middle"
          className="fill-muted-foreground stroke-none text-[9px]"
        >
          {beat.tuplet}
        </text>
      )}
    </g>
  );
}

function Beams({
  group,
  beatOf,
}: {
  group: BeatLayout[];
  beatOf: (layout: BeatLayout) => TabBeat | undefined;
}) {
  const first = group[0];
  const last = group.at(-1);
  if (!first || !last) {
    return null;
  }
  const beats = group.map(beatOf);
  const count = Math.min(...beats.map((beat) => beamCount(beat?.duration ?? 8)));
  const bottom = RHYTHM_TOP + STEM;
  const tuplet = beats[0]?.tuplet;
  return (
    <g className="stroke-muted-foreground">
      {Array.from({ length: count }, (_, i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: beams are positional
          key={i}
          x1={first.x}
          x2={last.x}
          y1={bottom - i * 4}
          y2={bottom - i * 4}
          strokeWidth={2}
        />
      ))}
      {tuplet && beats.every((beat) => beat?.tuplet === tuplet) && (
        <text
          x={(first.x + last.x) / 2}
          y={bottom + 10}
          textAnchor="middle"
          className="fill-muted-foreground stroke-none text-[9px]"
        >
          {tuplet}
        </text>
      )}
    </g>
  );
}
