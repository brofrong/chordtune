import {
  chordList,
  fromChordsOverLyrics,
  importObsidian,
  parse,
  serialize,
} from '@chordtune/chord-sheet';

import { type Draft, EMPTY_DRAFT } from '@/features/editor/use-draft';

const MAX_NOTES = 5_000;

/** An Obsidian note, or plain chords over lyrics, as a draft for the editor; null if no chords. */
export function draftFromNote(text: string): Draft | null {
  const imported = importObsidian(text);
  if (chordList(parse(imported.content).doc).length > 0) {
    return {
      ...EMPTY_DRAFT,
      artist: imported.artist,
      title: imported.title,
      capo: imported.capo,
      tempo: imported.tempo,
      notes: imported.notes.slice(0, MAX_NOTES),
      content: imported.content,
      rhythms: imported.rhythms,
    };
  }
  const { doc } = fromChordsOverLyrics(text.trim());
  return chordList(doc).length > 0 ? { ...EMPTY_DRAFT, content: serialize(doc) } : null;
}
