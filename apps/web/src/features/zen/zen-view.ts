import { chordKey, chordList, type SongDoc, type ZenModeId } from '@chordtune/chord-sheet';

import type { ZenLine, ZenPosition } from './zen-timing';

export const AUTO_STRIP_MAX_CHORDS = 4;

/**
 * The listener's choice, else the author's, else the strip for songs of one to four chords — a
 * song with no chords at all (tabs only) has no strip to show.
 */
export function resolveZenMode(
  listener: ZenModeId | null,
  author: ZenModeId | null,
  doc: SongDoc,
): ZenModeId {
  const chords = chordList(doc).length;
  return listener ?? author ?? (chords > 0 && chords <= AUTO_STRIP_MAX_CHORDS ? 'strip' : 'inline');
}

/** What `ownsSpaceKey` needs of a key event's target (an `Element`, or a stand-in in tests). */
export type KeyTarget = {
  tagName: string;
  isContentEditable?: boolean;
  getAttribute: (name: string) => string | null;
};

const SPACE_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
const SPACE_ROLES = new Set([
  'button',
  'checkbox',
  'link',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'radio',
  'slider',
  'switch',
  'tab',
  'textbox',
]);

/**
 * Whether Space on this focused element already does something of its own (presses a button,
 * types a space, picks a row), so zen's global Space-to-start/pause must leave it alone.
 */
export function ownsSpaceKey(target: KeyTarget | null): boolean {
  if (!target) {
    return false;
  }
  if (SPACE_TAGS.has(target.tagName) || target.isContentEditable) {
    return true;
  }
  if (target.tagName === 'A' && target.getAttribute('href') !== null) {
    return true;
  }
  return SPACE_ROLES.has(target.getAttribute('role') ?? '');
}

/** The smallest sliver of a row the paused drag must always leave on screen. */
const MIN_VISIBLE_PX = 40;

/**
 * Limits a hand-drag `nudge` on the paused text: `offset` is where the playback glide already
 * put the content, so `offset + nudge` is what is actually on screen. Clamps that sum so at
 * least `MIN_VISIBLE_PX` of a row stays inside the `height`-tall viewport, given the scrollable
 * content is `length` px tall, then returns the nudge alone (the caller adds `offset` back when
 * it renders). A viewport too small to leave `MIN_VISIBLE_PX` of room at both ends has no valid
 * clamp window, so the nudge passes through unclamped in that (practically unreachable) case.
 */
export function clampNudge(offset: number, nudge: number, height: number, length: number): number {
  const visible = offset + nudge;
  const max = height - MIN_VISIBLE_PX;
  const min = MIN_VISIBLE_PX - length;
  if (min > max) {
    return nudge;
  }
  return Math.min(max, Math.max(min, visible)) - offset;
}

export type RowEmphasis = 'current' | 'next' | 'after' | 'later' | 'past';

/** How bright a row is, by its distance from the current row in the order rows are shown. */
export function rowEmphasis(row: number, currentRow: number): RowEmphasis {
  const distance = row - currentRow;
  if (distance < 0) {
    return 'past';
  }
  return distance === 0 ? 'current' : distance === 1 ? 'next' : distance === 2 ? 'after' : 'later';
}

export type StripState = { chords: string[]; current: number | null; next: number | null };

/** The chord (by `chordKey`) at the `k`-th chord of a zen line, or null for tab beats. */
function chordAt(doc: SongDoc, zen: ZenLine | undefined, k: number): string | null {
  const line = zen ? doc.sections[zen.section]?.lines[zen.line] : undefined;
  if (!zen || line?.type !== 'line') {
    return null;
  }
  const item = line.items[zen.chordItems[k] ?? -1];
  return item?.type === 'chord' ? chordKey(item.chord) : null;
}

/**
 * The chords of the section being played, in order of first appearance, with the one sounding
 * and the next different one coming (null when it is not in this section's strip).
 */
export function sectionStrip(doc: SongDoc, lines: ZenLine[], position: ZenPosition): StripState {
  const playing = lines[position.index];
  if (!playing) {
    return { chords: [], current: null, next: null };
  }
  const chords: string[] = [];
  const keys: string[] = [];
  for (const line of doc.sections[playing.section]?.lines ?? []) {
    if (line.type !== 'line') {
      continue;
    }
    for (const item of line.items) {
      const key = item.type === 'chord' ? chordKey(item.chord) : null;
      if (item.type === 'chord' && key && !keys.includes(key)) {
        keys.push(key);
        chords.push(item.chord);
      }
    }
  }

  const now = chordAt(doc, playing, position.chord);
  let upcoming: string | null = null;
  for (let i = position.index, k = position.chord + 1; i < lines.length && !upcoming; i++, k = 0) {
    const zen = lines[i];
    for (; zen && k < zen.chordItems.length; k++) {
      const key = chordAt(doc, zen, k);
      if (key && key !== now) {
        upcoming = key;
        break;
      }
    }
  }

  const current = now ? keys.indexOf(now) : -1;
  const next = upcoming ? keys.indexOf(upcoming) : -1;
  return { chords, current: current >= 0 ? current : null, next: next >= 0 ? next : null };
}

/**
 * When to start from a tapped line (its first chord) or one of its chords (`item`, an index into
 * the line's items); a line that takes no time starts at the next line that does.
 */
export function seekTime(
  lines: ZenLine[],
  section: number,
  line: number,
  item: number | null = null,
): number | null {
  const zen = lines.find(
    (candidate) =>
      candidate.section > section || (candidate.section === section && candidate.line >= line),
  );
  if (!zen) {
    return null;
  }
  if (item !== null && zen.section === section && zen.line === line) {
    const k = zen.chordItems.indexOf(item);
    if (k >= 0) {
      return zen.chordStarts[k] ?? zen.start;
    }
  }
  return zen.start;
}
