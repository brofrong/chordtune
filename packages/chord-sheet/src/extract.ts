import { chordKey } from './shape';
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
        const key = item.type === 'chord' ? chordKey(item.chord) : null;
        if (key) {
          chords.add(key);
        }
      }
    }
  }
  return [...chords];
}

/** Key → the first spelling written in the song (`Bm` → `Hm` when the song writes it that way). */
export function chordSpellings(doc: SongDoc): Map<string, string> {
  const spellings = new Map<string, string>();
  for (const section of doc.sections) {
    for (const line of section.lines) {
      if (line.type !== 'line') {
        continue;
      }
      for (const item of line.items) {
        if (item.type !== 'chord') {
          continue;
        }
        const key = chordKey(item.chord);
        if (key && !spellings.has(key)) {
          spellings.set(key, item.chord);
        }
      }
    }
  }
  return spellings;
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
