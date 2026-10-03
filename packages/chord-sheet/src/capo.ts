import { refretBlock, rewriteAlphaTex } from './refret';
import { spellingOf, transposeChord } from './transpose';
import type { Line, SongDoc } from './types';

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
): { doc: SongDoc; unreachable: number; stale: number } {
  if (from === to) {
    return { doc, unreachable: 0, stale: 0 };
  }
  const shift = from - to;
  const spelling = spellingOf(doc);
  let unreachable = 0;
  let stale = 0;

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
      unreachable += moved.unreachable;
      const source = rewriteAlphaTex(line.source, line.block, moved.block);
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
  };
}
