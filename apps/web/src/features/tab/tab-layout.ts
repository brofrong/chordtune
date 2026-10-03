import type { TabBlock } from '@chordtune/chord-sheet';

export const QUARTER_WIDTH = 36;
export const MIN_BEAT_WIDTH = 18;
export const BAR_PAD = 10;
const EPSILON = 1e-6;

export type BeatLayout = {
  bar: number;
  beat: number;
  /** Centre of the beat column. */
  x: number;
  width: number;
  /** Quarter notes from the start of the bar. */
  at: number;
};

export type RowLayout = {
  bars: { index: number; x: number; width: number }[];
  beats: BeatLayout[];
  width: number;
};

/**
 * Beat columns grow with the duration (a quarter is `QUARTER_WIDTH`) but never get narrower
 * than a fret number; bars wrap into rows no wider than `width` (a longer bar gets its own row).
 */
export function layoutTab(block: TabBlock, width: number): RowLayout[] {
  const rows: RowLayout[] = [];
  let row: RowLayout | null = null;

  block.bars.forEach((bar, index) => {
    const widths = bar.beats.map((beat) => Math.max(MIN_BEAT_WIDTH, beat.quarters * QUARTER_WIDTH));
    const barWidth = BAR_PAD * 2 + widths.reduce((sum, w) => sum + w, 0);
    if (!row || (row.width + barWidth > width && row.bars.length > 0)) {
      row = { bars: [], beats: [], width: 0 };
      rows.push(row);
    }
    const x = row.width;
    let cursor = x + BAR_PAD;
    let at = 0;
    bar.beats.forEach((beat, beatIndex) => {
      const beatWidth = widths[beatIndex] ?? MIN_BEAT_WIDTH;
      row?.beats.push({
        bar: index,
        beat: beatIndex,
        x: cursor + beatWidth / 2,
        width: beatWidth,
        at,
      });
      cursor += beatWidth;
      at += beat.quarters;
    });
    row.bars.push({ index, x, width: barWidth });
    row.width += barWidth;
  });
  return rows;
}

/**
 * Quarter notes from the block's start to a bar/beat, ignoring repeats (as drawn, not as
 * played) — the same domain `layoutTab` draws rows in, so a row's start can be compared against
 * the currently active beat regardless of which pass through a repeat it's on.
 */
export function tabBeatQuarters(block: TabBlock, bar: number, beat = 0): number {
  let at = 0;
  for (let i = 0; i < bar; i++) {
    for (const b of block.bars[i]?.beats ?? []) {
      at += b.quarters;
    }
  }
  for (const b of (block.bars[bar]?.beats ?? []).slice(0, beat)) {
    at += b.quarters;
  }
  return at;
}

/** Runs of two or more 8th-or-shorter notes in the same quarter of a bar share a beam. */
export function beamGroups(block: TabBlock, row: RowLayout): BeatLayout[][] {
  const groups: BeatLayout[][] = [];
  let group: BeatLayout[] = [];
  let key = '';
  const flush = () => {
    if (group.length > 1) {
      groups.push(group);
    }
    group = [];
    key = '';
  };
  for (const layout of row.beats) {
    const beat = block.bars[layout.bar]?.beats[layout.beat];
    if (!beat || beat.notes.length === 0 || beat.duration < 8) {
      flush();
      continue;
    }
    const nextKey = `${layout.bar}:${Math.floor(layout.at + EPSILON)}`;
    if (nextKey !== key) {
      flush();
      key = nextKey;
    }
    group.push(layout);
  }
  flush();
  return groups;
}
