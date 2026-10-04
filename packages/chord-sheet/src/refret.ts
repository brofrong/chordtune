import { alphaTexNoteTokens, NOTE_RE } from './alphatex';
import type { TabBlock, TabNote } from './tab';

const MAX_FRET = 24;

type Place = { string: number; fret: number; unreachable?: true };
/** `avoid`: strings a dead note strikes after this beat, up to and including this note's tie. */
type Movable = { note: TabNote; index: number; pitch: number; avoid: ReadonlySet<number> };

/**
 * For every note whose next note (by position) on the same string is a tie, the index (in
 * written order over the whole block) of the beat holding that tie — the given note's string must
 * stay reserved (not handed to another note) until that tie is placed. Dead (`x`) notes are
 * excluded: they never move, so there is nothing to reserve. Keyed by `${bar}.${beat}.${noteIndex}`.
 */
function tieBeatByPosition(block: TabBlock): Map<string, number> {
  const byString = new Map<number, { key: string; beat: number; tie: boolean }[]>();
  let beatIndex = 0;
  block.bars.forEach((bar, b) => {
    bar.beats.forEach((beat, k) => {
      beat.notes.forEach((note, n) => {
        if (note.fret === 'x') {
          return;
        }
        const list = byString.get(note.string) ?? [];
        list.push({ key: `${b}.${k}.${n}`, beat: beatIndex, tie: note.tie });
        byString.set(note.string, list);
      });
      beatIndex++;
    });
  });
  const result = new Map<string, number>();
  for (const occurrences of byString.values()) {
    occurrences.forEach((occurrence, i) => {
      const next = occurrences[i + 1];
      if (next?.tie) {
        result.set(occurrence.key, next.beat);
      }
    });
  }
  return result;
}

/**
 * The block for a capo at `to` instead of `from`, sounding the same: each note keeps its pitch
 * and goes to its own string if a fret fits, else to another string, never sharing a string
 * within a beat; a tie follows its note. A string holding a note for a tie that comes later is
 * reserved — excluded from other notes' free strings — in every beat between the note and its
 * tie, so a later note cannot steal it and leave the tie pointing at the wrong fret; for the same
 * reason such a note never goes to a string a dead note strikes before its tie ends. A beat's
 * movable notes (not dead, not a tie) are placed together by `bestAssignment`, which tries every
 * assignment to the beat's free strings so one note's move can make room for another (see its doc
 * comment for the order of preference). Notes that fit on no free string get a fret outside 0–24
 * and `unreachable` on their own string (on the closest free one if a tie or a held note is on
 * it), which no other note of the beat may then take. Hammer/slide marks between notes that end
 * up on different strings are dropped.
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
  const tieBeat = tieBeatByPosition(block);
  const deadStrings = block.bars.flatMap((bar) =>
    bar.beats.map((beat) => new Set(beat.notes.filter((n) => n.fret === 'x').map((n) => n.string))),
  );
  const heldStrings = new Set<number>();
  let unreachable = 0;
  let beatIndex = -1;

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

  const settle = (note: TabNote, place: Place, taken: Set<number>): TabNote => {
    taken.add(place.string);
    placedOn.set(note.string, place);
    if (place.unreachable) {
      unreachable++;
    }
    return { ...note, ...place };
  };

  const bars = block.bars.map((bar, b) => ({
    ...bar,
    beats: bar.beats.map((beat, k) => {
      beatIndex++;
      const taken = new Set<number>();
      const placed: TabNote[] = [...beat.notes];

      // Dead notes and ties have fixed strings: place them before the movable notes.
      beat.notes.forEach((note, index) => {
        if (note.fret === 'x' || note.tie) {
          placed[index] = placeFixed(note, taken);
        }
      });

      const allStrings = Array.from({ length: count }, (_, i) => i + 1);
      const movable: Movable[] = [];
      beat.notes.forEach((note, index) => {
        if (note.fret !== 'x' && !note.tie) {
          // A note with a tie ahead keeps its string until then: a dead note struck on that
          // string in the meantime (the tie's own beat included) would share it with the tie.
          const until = tieBeat.get(`${b}.${k}.${index}`) ?? beatIndex;
          const avoid = new Set(deadStrings.slice(beatIndex + 1, until + 1).flatMap((s) => [...s]));
          const pitch = open(note.string) + from + (note.fret as number);
          movable.push({ note, index, pitch, avoid });
        }
      });

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
        placed[index] = settle(
          note,
          assignment.get(index) ?? {
            string: note.string,
            fret: pitch - open(note.string) - to,
            unreachable: true,
          },
          taken,
        );
      }

      // A note followed later by a tie on its own source string stays held until that tie is
      // placed; a tie placed just now releases its string for anyone to use from the next beat on.
      beat.notes.forEach((note, index) => {
        if (note.fret === 'x') {
          return;
        }
        if (note.tie) {
          heldStrings.delete(note.string);
        } else if (tieBeat.has(`${b}.${k}.${index}`)) {
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
 * The best way to put a beat's movable notes on its free strings (minus each note's `avoid`). A
 * note with a fret in 0–24 on none of them falls back `unreachable` to its own string — or, when
 * that string is not free (a tie or a held note is on it, or the note must avoid it), to the
 * closest free string — and occupies it like any other note. Preferred: as few notes as possible left with no string at all, then as many reachable
 * notes as possible, then the smallest total |new string − old string|, then — on a tie in all
 * — the thickest reachable strings overall (the higher the sum of their string numbers, the
 * thicker). Notes left with no string (only when the beat has no free string left for them) are
 * absent from the result; the caller leaves them `unreachable` on their own string.
 */
function bestAssignment(
  movable: readonly Movable[],
  freeStrings: readonly number[],
  to: number,
  open: (string: number) => number,
): Map<number, Place> {
  const fits = (fret: number) => fret >= 0 && fret <= MAX_FRET;
  const candidatesFor = ({ note, pitch, avoid }: Movable): Place[] => {
    const usable = freeStrings.filter((string) => !avoid.has(string));
    const places = usable
      .map((string) => ({ string, fret: pitch - open(string) - to }))
      .sort(
        (a, b) =>
          Math.abs(a.string - note.string) - Math.abs(b.string - note.string) ||
          b.string - a.string,
      );
    const ownStringFree = usable.includes(note.string);
    const fallbacks = places
      .filter((place) => !fits(place.fret) && (!ownStringFree || place.string === note.string))
      .map((place) => ({ ...place, unreachable: true as const }));
    return [...places.filter((place) => fits(place.fret)), ...fallbacks];
  };

  const used = new Set<number>();
  const assignment: (Place | null)[] = new Array(movable.length).fill(null);
  let bestLeft = Infinity;
  let bestCount = -1;
  let bestDistance = Infinity;
  let bestThickness = -Infinity;
  let bestAssignment: (Place | null)[] = [];

  const recurse = (i: number, left: number, count: number, distance: number, thickness: number) => {
    if (i === movable.length) {
      const better =
        left < bestLeft ||
        (left === bestLeft &&
          (count > bestCount ||
            (count === bestCount && distance < bestDistance) ||
            (count === bestCount && distance === bestDistance && thickness > bestThickness)));
      if (better) {
        bestLeft = left;
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
    for (const place of candidatesFor(current)) {
      if (used.has(place.string)) {
        continue;
      }
      used.add(place.string);
      assignment[i] = place;
      recurse(
        i + 1,
        left,
        place.unreachable ? count : count + 1,
        distance + Math.abs(place.string - current.note.string),
        place.unreachable ? thickness : thickness + place.string,
      );
      used.delete(place.string);
    }
    assignment[i] = null;
    recurse(i + 1, left + 1, count, distance, thickness);
  };

  recurse(0, 0, 0, 0, 0);

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
