import { parseChord, pitchClass } from './chord';
import type { SongDoc } from './types';

const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** How a song spells notes: sharps or flats, and `H` for B natural. */
export type Spelling = { accidental: 'sharp' | 'flat'; germanH: boolean };

/** Flats if the song's chords use more `b` than `#`; `H` if any chord is written with it. */
export function spellingOf(doc: SongDoc): Spelling {
  let sharps = 0;
  let flats = 0;
  let germanH = false;
  for (const section of doc.sections) {
    for (const line of section.lines) {
      if (line.type !== 'line') {
        continue;
      }
      for (const item of line.items) {
        if (item.type !== 'chord' || !parseChord(item.chord)) {
          continue;
        }
        const [name = '', bass = ''] = item.chord.split('/');
        for (const note of [name.slice(0, 2), bass.slice(0, 2)]) {
          if (note[1] === '#') {
            sharps++;
          } else if (note[1] === 'b') {
            flats++;
          }
          if (note[0] === 'H') {
            germanH = true;
          }
        }
      }
    }
  }
  return { accidental: flats > sharps ? 'flat' : 'sharp', germanH };
}

/** `raw` moved by `semitones`, spelled per `spelling`; anything that is not a chord stays. */
export function transposeChord(raw: string, semitones: number, spelling: Spelling): string {
  const chord = parseChord(raw);
  if (!chord) {
    return raw;
  }
  const names = spelling.accidental === 'flat' ? FLATS : SHARPS;
  const name = (note: string) => {
    const spelled = names[(((pitchClass(note) + semitones) % 12) + 12) % 12] ?? note;
    return spelling.germanH && spelled === 'B' ? 'H' : spelled;
  };
  return `${name(chord.root)}${chord.suffix}${chord.bass ? `/${name(chord.bass)}` : ''}`;
}
