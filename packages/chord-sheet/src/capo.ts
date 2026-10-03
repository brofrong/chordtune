import { refretBlock, rewriteAlphaTex } from './refret';
import { spellingOf, transposeChord } from './transpose';
import type { Line, SongDoc } from './types';

/**
 * What a recalculated alphaTex block costs the "Recalculate" action: `unreachable` notes always
 * leave the block `stale` too (its source cannot be written back — see `rewriteAlphaTex`), so
 * counting both `unreachable` and every `stale` block double-counts the same problem and hides a
 * block that is stale for its own, different reason (its source has an error). `brokenTabs` is 1
 * only for that second kind: stale with no unreachable note to blame it on.
 */
export function recalcBlock(
  unreachable: number,
  rewritten: string[] | null,
): { unreachable: number; brokenTabs: number } {
  return { unreachable, brokenTabs: rewritten === null && unreachable === 0 ? 1 : 0 };
}

/**
 * The song for a capo at `to` instead of `from`, sounding the same: chord names move by
 * `from − to` semitones in the song's spelling, alphaTex notes move to other frets/strings and
 * their source is rewritten, ASCII tabs stay as written.
 */
export function withCapo(
  doc: SongDoc,
  strings: readonly number[],
  from: number,
  to: number,
): { doc: SongDoc; unreachable: number; stale: number; brokenTabs: number } {
  if (from === to) {
    return { doc, unreachable: 0, stale: 0, brokenTabs: 0 };
  }
  const shift = from - to;
  const spelling = spellingOf(doc);
  let unreachable = 0;
  let stale = 0;
  let brokenTabs = 0;

  const move = (line: Line): Line => {
    if (line.type === 'line') {
      return {
        ...line,
        items: line.items.map((item) =>
          item.type === 'chord'
            ? { ...item, chord: transposeChord(item.chord, shift, spelling) }
            : item,
        ),
      };
    }
    if (line.type === 'alphatex') {
      const moved = refretBlock(line.block, strings, from, to);
      const source = rewriteAlphaTex(line.source, line.block, moved.block);
      const block = recalcBlock(moved.unreachable, source);
      unreachable += block.unreachable;
      brokenTabs += block.brokenTabs;
      if (!source) {
        stale++;
      }
      return { ...line, block: moved.block, source: source ?? line.source };
    }
    return line;
  };

  return {
    doc: {
      ...doc,
      sections: doc.sections.map((section) => ({ ...section, lines: section.lines.map(move) })),
    },
    unreachable,
    stale,
    brokenTabs,
  };
}
