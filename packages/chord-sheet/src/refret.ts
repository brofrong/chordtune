import { alphaTexNoteTokens } from './alphatex';
import type { TabBlock, TabNote } from './tab';

const MAX_FRET = 24;
const NOTE_RE = /^(\d+|x|-)\.(\d+)(?:\.(\d+))?$/;

type Place = { string: number; fret: number };

/**
 * The block for a capo at `to` instead of `from`, sounding the same: each note keeps its pitch
 * and goes to its own string if a fret fits, else to the nearest string that has one (thicker
 * first), never sharing a string within a beat; a tie follows its note. Notes that fit nowhere
 * stay with a negative fret and `unreachable`. Hammer/slide marks between notes that end up on
 * different strings are dropped.
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

  const place = (note: TabNote, taken: Set<number>): TabNote => {
    if (note.fret === 'x') {
      taken.add(note.string);
      return note;
    }
    if (note.tie) {
      const held = placedOn.get(note.string) ?? { string: note.string, fret: note.fret };
      taken.add(held.string);
      return { ...note, string: held.string, fret: held.fret };
    }
    const pitch = open(note.string) + from + note.fret;
    const candidates = Array.from({ length: count }, (_, i) => i + 1).sort(
      (a, b) => Math.abs(a - note.string) - Math.abs(b - note.string) || b - a,
    );
    for (const string of candidates) {
      const fret = pitch - open(string) - to;
      if (!taken.has(string) && fret >= 0 && fret <= MAX_FRET) {
        taken.add(string);
        placedOn.set(note.string, { string, fret });
        return { ...note, string, fret };
      }
    }
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
      // Dead notes and ties have fixed strings: place them before the others.
      const order = beat.notes
        .map((note, index) => ({ note, index }))
        .sort((a, b) => rank(a.note) - rank(b.note));
      const placed: TabNote[] = [...beat.notes];
      for (const { note, index } of order) {
        placed[index] = place(note, taken);
      }
      return { ...beat, notes: placed };
    }),
  }));

  return { block: { ...block, bars: dropBrokenLegato(block, bars) }, unreachable };
}

const rank = (note: TabNote) => (note.fret === 'x' ? 0 : note.tie ? 1 : 2);

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
