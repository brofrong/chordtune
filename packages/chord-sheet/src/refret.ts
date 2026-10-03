import { alphaTexNoteTokens, NOTE_RE } from './alphatex';
import type { TabBlock, TabNote } from './tab';

const MAX_FRET = 24;

type Place = { string: number; fret: number };
type Movable = { note: TabNote; index: number; pitch: number };

/**
 * The block for a capo at `to` instead of `from`, sounding the same: each note keeps its pitch
 * and goes to its own string if a fret fits, else to another string, never sharing a string
 * within a beat; a tie follows its note. A beat's movable notes (not dead, not a tie) are placed
 * together by `bestAssignment`, which tries every assignment to the beat's free strings so one
 * note's move can make room for another (see its doc comment for the order of preference). Notes
 * that fit nowhere stay on their own string with a fret outside 0–24 and `unreachable`.
 * Hammer/slide marks between notes that end up on different strings are dropped.
 */
export function refretBlock(
  block: TabBlock,
  strings: readonly number[],
  from: number,
  to: number,
): { block: TabBlock; unreachable: number } {
  const count = strings.length;
  const open = (string: number) => strings[count - string] ?? 0;
  const placedOn = new Map<number, Place>();
  let unreachable = 0;

  const placeFixed = (note: TabNote, taken: Set<number>): TabNote => {
    if (note.fret === 'x') {
      taken.add(note.string);
      return note;
    }
    const held = placedOn.get(note.string) ?? { string: note.string, fret: note.fret };
    taken.add(held.string);
    return { ...note, string: held.string, fret: held.fret };
  };

  const markUnreachable = (note: TabNote, pitch: number, taken: Set<number>): TabNote => {
    unreachable++;
    const fret = pitch - open(note.string) - to;
    taken.add(note.string);
    placedOn.set(note.string, { string: note.string, fret });
    return { ...note, fret, unreachable: true };
  };

  const bars = block.bars.map((bar) => ({
    ...bar,
    beats: bar.beats.map((beat) => {
      const taken = new Set<number>();
      const placed: TabNote[] = [...beat.notes];

      // Dead notes and ties have fixed strings: place them before the movable notes.
      beat.notes.forEach((note, index) => {
        if (note.fret === 'x' || note.tie) {
          placed[index] = placeFixed(note, taken);
        }
      });

      const movable: Movable[] = [];
      beat.notes.forEach((note, index) => {
        if (note.fret !== 'x' && !note.tie) {
          movable.push({ note, index, pitch: open(note.string) + from + (note.fret as number) });
        }
      });
      const freeStrings = Array.from({ length: count }, (_, i) => i + 1).filter(
        (string) => !taken.has(string),
      );
      const assignment = bestAssignment(movable, freeStrings, to, open);
      for (const { note, index, pitch } of movable) {
        const choice = assignment.get(index);
        if (choice) {
          taken.add(choice.string);
          placedOn.set(note.string, choice);
          placed[index] = { ...note, string: choice.string, fret: choice.fret };
        } else {
          placed[index] = markUnreachable(note, pitch, taken);
        }
      }

      return { ...beat, notes: placed };
    }),
  }));

  return { block: { ...block, bars: dropBrokenLegato(block, bars) }, unreachable };
}

/**
 * The best way to put a beat's movable notes on its free strings: as many notes placed as
 * possible, then the smallest total |new string − old string|, then (by trying closer and
 * thicker strings first in the search, so the first assignment found at the best score wins)
 * thicker strings on ties. Notes left out (no string left with a fret in 0–24) are absent from
 * the result; the caller marks them `unreachable` on their own string.
 */
function bestAssignment(
  movable: readonly Movable[],
  freeStrings: readonly number[],
  to: number,
  open: (string: number) => number,
): Map<number, Place> {
  const candidatesFor = (note: TabNote, pitch: number) =>
    freeStrings
      .map((string) => ({ string, fret: pitch - open(string) - to }))
      .filter((place) => place.fret >= 0 && place.fret <= MAX_FRET)
      .sort(
        (a, b) =>
          Math.abs(a.string - note.string) - Math.abs(b.string - note.string) ||
          b.string - a.string,
      );

  const used = new Set<number>();
  const assignment: (Place | null)[] = new Array(movable.length).fill(null);
  let bestCount = -1;
  let bestDistance = Infinity;
  let bestAssignment: (Place | null)[] = [];

  const recurse = (i: number, count: number, distance: number) => {
    if (i === movable.length) {
      if (count > bestCount || (count === bestCount && distance < bestDistance)) {
        bestCount = count;
        bestDistance = distance;
        bestAssignment = [...assignment];
      }
      return;
    }
    const current = movable[i];
    if (!current) {
      return;
    }
    for (const place of candidatesFor(current.note, current.pitch)) {
      if (used.has(place.string)) {
        continue;
      }
      used.add(place.string);
      assignment[i] = place;
      recurse(i + 1, count + 1, distance + Math.abs(place.string - current.note.string));
      used.delete(place.string);
    }
    assignment[i] = null;
    recurse(i + 1, count, distance);
  };

  recurse(0, 0, 0);

  const result = new Map<number, Place>();
  bestAssignment.forEach((place, i) => {
    const entry = movable[i];
    if (place && entry) {
      result.set(entry.index, place);
    }
  });
  return result;
}

/** Written-order list of `[before, after]` notes, so effects can look at the next note. */
function pairs(before: TabBlock['bars'], after: TabBlock['bars']) {
  return before.flatMap((bar, b) =>
    bar.beats.flatMap((beat, k) =>
      beat.notes.map((note, n) => ({
        before: note,
        after: after[b]?.beats[k]?.notes[n] ?? note,
        at: [b, k, n] as const,
      })),
    ),
  );
}

function dropBrokenLegato(original: TabBlock, bars: TabBlock['bars']): TabBlock['bars'] {
  const all = pairs(original.bars, bars);
  for (const [i, { before, after, at }] of all.entries()) {
    if (!before.effects.hammer && !before.effects.slide) {
      continue;
    }
    const next = all.slice(i + 1).find((other) => other.before.string === before.string);
    // Nothing to slur to, or both still on one string: the mark stays.
    if (next && after.string !== next.after.string) {
      const { hammer: _hammer, slide: _slide, ...rest } = after.effects;
      const beat = bars[at[0]]?.beats[at[1]];
      if (beat) {
        beat.notes[at[2]] = { ...after, effects: rest };
      }
    }
  }
  return bars;
}

export function countUnreachable(block: TabBlock): number {
  return block.bars.reduce(
    (sum, bar) =>
      sum +
      bar.beats.reduce((inBar, beat) => inBar + beat.notes.filter((n) => n.unreachable).length, 0),
    0,
  );
}

/**
 * `source` with every note's fret and string replaced from `after` (durations, effects, text and
 * spacing stay). Null when the note words do not line up with `before` (the block has errors) or
 * a note of `after` is unreachable — such a block cannot be written back.
 */
export function rewriteAlphaTex(
  source: readonly string[],
  before: TabBlock,
  after: TabBlock,
): string[] | null {
  const tokens = alphaTexNoteTokens(source);
  const flat = (tab: TabBlock) =>
    tab.bars.flatMap((bar) => bar.beats.flatMap((beat) => beat.notes));
  const beforeNotes = flat(before);
  const afterNotes = flat(after);
  if (tokens.length !== beforeNotes.length || afterNotes.some((note) => note.unreachable)) {
    return null;
  }
  const lines = [...source];
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    const note = afterNotes[i];
    const match = token ? NOTE_RE.exec(token.text) : null;
    if (!token || !note || !match) {
      return null;
    }
    const fret = match[1] === '-' || match[1] === 'x' ? match[1] : String(note.fret);
    const duration = match[3] !== undefined ? `.${match[3]}` : '';
    const text = lines[token.line] ?? '';
    lines[token.line] =
      text.slice(0, token.col) +
      `${fret}.${note.string}${duration}` +
      text.slice(token.col + token.text.length);
  }
  return lines;
}
