import { barreOf } from '@chordtune/audio';

export const DIAGRAM_FRETS = 5;

export type DiagramLayout = {
  /** The fret the first drawn row stands for; 1 draws the nut. */
  base: number;
  /** `string` is an index, thickest = 0; `fret` is relative to `base` (1 = first row). */
  dots: { string: number; fret: number }[];
  open: number[];
  muted: number[];
  barre: { fret: number; from: number; to: number } | null;
};

/** What a chord box draws: from the nut when the shape fits in five frets, else from its lowest fret. */
export function diagramLayout(frets: readonly (number | null)[]): DiagramLayout {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  const base =
    fretted.length === 0 || Math.max(...fretted) <= DIAGRAM_FRETS ? 1 : Math.min(...fretted);
  const barre = barreOf(frets);
  const dots: DiagramLayout['dots'] = [];
  const open: number[] = [];
  const muted: number[] = [];
  frets.forEach((fret, string) => {
    if (fret === null) {
      muted.push(string);
    } else if (fret === 0) {
      open.push(string);
    } else if (!(barre && fret === barre.fret && string >= barre.from && string <= barre.to)) {
      dots.push({ string, fret: fret - base + 1 });
    }
  });
  return {
    base,
    dots,
    open,
    muted,
    barre: barre ? { fret: barre.fret - base + 1, from: barre.from, to: barre.to } : null,
  };
}
