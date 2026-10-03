import { alphaTexNoteTokens, NOTE_RE } from './alphatex';
import type { TabBlock, TabNote } from './tab';

const MAX_FRET = 24;

type Place = { string: number; fret: number; unreachable?: true };
type Movable = { note: TabNote; index: number; pitch: number };

/**
 * For every source string, whether the note right after a given note (by position) on that same
 * string is a tie — i.e. the given note's string must stay reserved (not handed to another note)
 * until that tie is placed. Dead (`x`) notes are excluded: they never move, so there is nothing to
 * reserve. Keyed by `${bar}.${beat}.${noteIndex}`.
 */
function nextIsTieByPosition(block: TabBlock): Map<string, boolean> {
  const byString = new Map<number, { b: number; k: number; n: number; tie: boolean }[]>();
  block.bars.forEach((bar, b) => {
    bar.beats.forEach((beat, k) => {
      beat.notes.forEach((note, n) => {
        if (note.fret === 'x') {
          return;
        }
        const list = byString.get(note.string) ?? [];
        list.push({ b, k, n, tie: note.tie });
        byString.set(note.string, list);
      });
    });
  });
  const result = new Map<string, boolean>();
  for (const occurrences of byString.values()) {
    occurrences.forEach((occurrence, i) => {
      const next = occurrences[i + 1];
      result.set(`${occurrence.b}.${occurrence.k}.${occurrence.n}`, next ? next.tie : false);
    });
  }
  return result;
}

/**
 * The block for a capo at `to` instead of `from`, sounding the same: each note keeps its pitch
 * and goes to its own string if a fret fits, else to another string, never sharing a string
 * within a beat; a tie follows its note. A string holding a note for a tie that comes later is
 * reserved — excluded from other notes' free strings — in every beat between the note and its
 * tie, so a later note cannot steal it and leave the tie pointing at the wrong fret. A beat's
 * movable notes (not dead, not a tie) are placed together by `bestAssignment`, which tries every
 * assignment to the beat's free strings so one note's move can make room for another (see its doc
 * comment for the order of preference). Notes that fit nowhere stay on their own string with a
 * fret outside 0–24 and `unreachable`. Hammer/slide marks between notes that end up on different
 * strings are dropped.
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
  const nextIsTie = nextIsTieByPosition(block);
  const heldStrings = new Set<number>();
  let unreachable = 0;

  const placeFixed = (note: TabNote, taken: Set<number>): TabNote => {
    if (note.fret === 'x') {
      taken.add(note.string);
      return note;
    }
    const held = placedOn.get(note.string) ?? { string: note.string, fret: note.fret };
    taken.add(held.string);
    return {
      ...note,
      string: held.string,
      fret: held.fret,
      ...(held.unreachable && { unreachable: true }),
    };
  };

  const markUnreachable = (note: TabNote, pitch: number, taken: Set<number>): TabNote => {
    unreachable++;
    const fret = pitch - open(note.string) - to;
    taken.add(note.string);
    placedOn.set(note.string, { string: note.string, fret, unreachable: true });
    return { ...note, fret, unreachable: true };
  };

  const bars = block.bars.map((bar, b) => ({
    ...bar,
    beats: bar.beats.map((beat, k) => {
      const taken = new Set<number>();
      const placed: TabNote[] = [...beat.notes];

      // Dead notes and ties have fixed strings: place them before the movable notes.
      beat.notes.forEach((note, index) => {
        if (note.fret === 'x' || note.tie) {
          placed[index] = placeFixed(note, taken);
        }
      });

      const allStrings = Array.from({ length: count }, (_, i) => i + 1);
      const movableAll: Movable[] = [];
      beat.notes.forEach((note, index) => {
        if (note.fret !== 'x' && !note.tie) {
          movableAll.push({ note, index, pitch: open(note.string) + from + (note.fret as number) });
        }
      });

      // A note with no valid fret on any string (not just the free ones) is unreachable no
      // matter what the rest of the beat does: settle it on its own string and reserve that
      // string before searching, so the search never gives it away to another note.
      const movable: Movable[] = [];
      for (const entry of movableAll) {
        const reachable = allStrings.some((string) => {
          const fret = entry.pitch - open(string) - to;
          return fret >= 0 && fret <= MAX_FRET;
        });
        if (reachable) {
          movable.push(entry);
        } else {
          placed[entry.index] = markUnreachable(entry.note, entry.pitch, taken);
        }
      }

      // Strings still ringing for an earlier note whose tie has not been placed yet: off limits
      // to everyone else until the tie claims them.
      const heldDestinations = new Set(
        Array.from(heldStrings, (source) => placedOn.get(source)?.string).filter(
          (string): string is number => string !== undefined,
        ),
      );
      const freeStrings = allStrings.filter(
        (string) => !taken.has(string) && !heldDestinations.has(string),
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

      // A note followed later by a tie on its own source string stays held until that tie is
      // placed; a tie placed just now releases its string for anyone to use from the next beat on.
      beat.notes.forEach((note, index) => {
        if (note.fret === 'x') {
          return;
        }
        if (note.tie) {
          heldStrings.delete(note.string);
        } else if (nextIsTie.get(`${b}.${k}.${index}`)) {
          heldStrings.add(note.string);
        } else {
          heldStrings.delete(note.string);
        }
      });

      return { ...beat, notes: placed };
    }),
  }));

  return { block: { ...block, bars: dropBrokenLegato(block, bars) }, unreachable };
}

/**
 * The best way to put a beat's movable notes on its free strings: as many notes placed as
 * possible, then the smallest total |new string − old string|, then — on a tie in both — the
 * thickest strings overall (the higher the sum of the assigned string numbers, the thicker).
 * Notes left out (no string left with a fret in 0–24) are absent from the result; the caller
 * marks them `unreachable` on their own string.
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
  let bestThickness = -Infinity;
  let bestAssignment: (Place | null)[] = [];

  const recurse = (i: number, count: number, distance: number, thickness: number) => {
    if (i === movable.length) {
      const better =
        count > bestCount ||
        (count === bestCount && distance < bestDistance) ||
        (count === bestCount && distance === bestDistance && thickness > bestThickness);
      if (better) {
        bestCount = count;
        bestDistance = distance;
        bestThickness = thickness;
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
      recurse(
        i + 1,
        count + 1,
        distance + Math.abs(place.string - current.note.string),
        thickness + place.string,
      );
      used.delete(place.string);
    }
    assignment[i] = null;
    recurse(i + 1, count, distance, thickness);
  };

  recurse(0, 0, 0, 0);

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
 * The text right after a note's token (the `{…}` effects group that belongs to it, if any) with
 * `word` (e.g. `h`, `sl`) removed from that group — the whole `{…}` is dropped when that was its
 * only word. `start` is the column right after the note's own text, in `text`.
 */
function dropEffectWord(text: string, start: number, word: string): string {
  const match = /^(\s*)\{([^}]*)\}/.exec(text.slice(start));
  if (!match) {
    return text;
  }
  const [whole, lead = '', inner = ''] = match;
  const words = inner.split(/\s+/).filter((part) => part !== '' && part !== word);
  const body = words.length > 0 ? `${lead}{${words.join(' ')}}` : '';
  return text.slice(0, start) + body + text.slice(start + whole.length);
}

/**
 * `source` with every note's fret and string replaced from `after` (durations, text and spacing
 * stay); a hammer-on or slide mark `before` had but `after` dropped (see `refretBlock`) is also
 * removed from the note's own `{…}` group, so the saved source cannot re-parse as a slur to some
 * other note. Null when the note words do not line up with `before` (the block has errors) or a
 * note of `after` is unreachable — such a block cannot be written back.
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
    const original = beforeNotes[i];
    const match = token ? NOTE_RE.exec(token.text) : null;
    if (!token || !note || !original || !match) {
      return null;
    }
    const fret = match[1] === '-' || match[1] === 'x' ? match[1] : String(note.fret);
    const duration = match[3] !== undefined ? `.${match[3]}` : '';
    let text = lines[token.line] ?? '';
    const tokenEnd = token.col + token.text.length;
    if (original.effects.hammer && !note.effects.hammer) {
      text = dropEffectWord(text, tokenEnd, 'h');
    }
    if (original.effects.slide && !note.effects.slide) {
      text = dropEffectWord(text, tokenEnd, 'sl');
    }
    lines[token.line] =
      `${text.slice(0, token.col)}${fret}.${note.string}${duration}${text.slice(tokenEnd)}`;
  }
  return lines;
}
