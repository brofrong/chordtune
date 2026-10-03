import { chordList, type SongDoc, spellingOf, transposeChord } from '@chordtune/chord-sheet';

import { voicingsFor } from './voicing';

export const MAX_HINT_CAPO = 7;
const MISSING_SHAPE_COST = 10;
const SECOND_STAR_MARGIN = 1;

export type CapoHint = {
  capo: number;
  /** Sum of the easiest shape's cost over the song's chords at this capo. */
  cost: number;
  barres: number;
  star: boolean;
  noBarre: boolean;
};

/** How easy the song's chords are at each capo fret 0–7; ★ on the easiest one or two. */
export function capoHints(
  doc: SongDoc,
  strings: readonly number[],
  authorCapo: number,
): CapoHint[] {
  const chords = chordList(doc);
  const spelling = spellingOf(doc);
  const hints = Array.from({ length: MAX_HINT_CAPO + 1 }, (_, capo) => {
    let cost = 0;
    let barres = 0;
    for (const chord of chords) {
      const shape = voicingsFor(transposeChord(chord, authorCapo - capo, spelling), strings)[0];
      cost += shape ? shape.cost : MISSING_SHAPE_COST;
      barres += shape?.barre ? 1 : 0;
    }
    return { capo, cost, barres, star: false, noBarre: chords.length > 0 && barres === 0 };
  });
  if (chords.length === 0) {
    return hints;
  }
  const ranked = [...hints].sort((a, b) => a.cost - b.cost);
  const [best, second] = ranked;
  if (best) {
    best.star = true;
  }
  if (best && second && second.cost <= best.cost + SECOND_STAR_MARGIN) {
    second.star = true;
  }
  return hints;
}
