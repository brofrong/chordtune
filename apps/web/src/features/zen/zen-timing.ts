import { eventSeconds } from '@chordtune/audio';
import { type Rhythm, type SongDoc, tabBeats, timeline } from '@chordtune/chord-sheet';

/** A line that has chords, with when it plays (seconds from the start). */
export type ZenLine = {
  section: number;
  line: number;
  start: number;
  end: number;
  /** When each chord (or tab beat) of the line starts, and its item index (or beat index). */
  chordStarts: number[];
  chordItems: number[];
};

/**
 * Lines in play order with their timing: a line lasts as long as its chords (one bar each
 * unless `|` splits them), in the tempo and time signature of their rhythm. Lines without
 * chords take no time; an alphaTex block is one line whose «chords» are its beats.
 */
export function zenLines(doc: SongDoc, rhythms: Rhythm[], bpm: number): ZenLine[] {
  const events = timeline(doc, rhythms);
  const seconds = eventSeconds(events, rhythms, bpm);
  const lines: ZenLine[] = [];
  const byKey = new Map<string, ZenLine>();

  events.forEach((event, index) => {
    const span = seconds[index];
    if (!span) {
      return;
    }
    const key = `${event.section}:${event.line}`;
    let line = byKey.get(key);
    if (!line) {
      line = {
        section: event.section,
        line: event.line,
        start: span.start,
        end: span.end,
        chordStarts: [],
        chordItems: [],
      };
      byKey.set(key, line);
      lines.push(line);
    }
    line.end = Math.max(line.end, span.end);
    if (event.kind === 'tab') {
      const quarterSec = 60 / (event.tempo ?? bpm);
      tabBeats(event.block).forEach((beat, index) => {
        line.chordStarts.push(span.start + beat.start * quarterSec);
        line.chordItems.push(index);
      });
    } else {
      line.chordStarts.push(span.start);
      line.chordItems.push(event.item);
    }
  });
  return lines;
}

export type ZenPosition = { index: number; progress: number; chord: number; done: boolean };

/** Which line plays at `t` seconds, how far into it, and which of its chords. */
export function zenPosition(lines: ZenLine[], t: number): ZenPosition {
  const last = lines.length - 1;
  const lastLine = lines[last];
  if (!lastLine || t >= lastLine.end) {
    return { index: Math.max(last, 0), progress: 1, chord: 0, done: true };
  }
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if ((lines[mid]?.start ?? 0) <= t) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  const line = lines[lo] as ZenLine;
  const progress =
    line.end > line.start ? Math.max(0, (t - line.start) / (line.end - line.start)) : 1;
  const chord = Math.max(
    0,
    line.chordStarts.findLastIndex((start) => start <= t),
  );
  return { index: lo, progress, chord, done: false };
}

const GLIDE_FROM = 0.7;

/** How far the view has moved towards the next line: still until 70%, then a smooth glide. */
export function zenOffset(progress: number): number {
  if (progress <= GLIDE_FROM) {
    return 0;
  }
  const x = Math.min(1, (progress - GLIDE_FROM) / (1 - GLIDE_FROM));
  return x * x * (3 - 2 * x);
}

export type RowGlide = { index: number; progress: number };

/**
 * Where playback sits among a tab block's rows: `starts` are each row's first beat, in quarter
 * notes from the block's start, ascending; `total` is the block's length the same way. `quarters`
 * is the currently active beat's position. Progress runs 0 to 1 within the active row, towards
 * the next row's start (or `total`, for the last row) — fed to `zenOffset` the same as a line's,
 * so a multi-row tab block glides row to row instead of snapping when the active one changes.
 */
export function zenRowGlide(starts: readonly number[], total: number, quarters: number): RowGlide {
  let index = 0;
  for (let i = 1; i < starts.length; i++) {
    if ((starts[i] ?? Number.POSITIVE_INFINITY) <= quarters) {
      index = i;
    }
  }
  const from = starts[index] ?? 0;
  const to = starts[index + 1] ?? total;
  const progress = to > from ? Math.min(1, Math.max(0, (quarters - from) / (to - from))) : 1;
  return { index, progress };
}
