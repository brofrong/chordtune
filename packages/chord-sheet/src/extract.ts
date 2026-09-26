import { parseChord } from './chord';
import type { SongDoc } from './types';

/** Unique chords in order of appearance, normalised (`Hm` → `Bm`); non-chords are dropped. */
export function chordList(doc: SongDoc): string[] {
  const chords = new Set<string>();
  for (const section of doc.sections) {
    for (const line of section.lines) {
      if (line.type !== 'line') {
        continue;
      }
      for (const item of line.items) {
        const chord = item.type === 'chord' ? parseChord(item.chord) : null;
        if (chord) {
          chords.add(`${chord.root}${chord.suffix}${chord.bass ? `/${chord.bass}` : ''}`);
        }
      }
    }
  }
  return [...chords];
}

/** Song text without chords, markers, headers and tabs — for search. */
export function lyrics(doc: SongDoc): string {
  const lines: string[] = [];
  for (const section of doc.sections) {
    for (const line of section.lines) {
      if (line.type !== 'line') {
        continue;
      }
      lines.push(
        line.items
          .map((item) => (item.type === 'text' ? item.text : ''))
          .join('')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
  }
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
