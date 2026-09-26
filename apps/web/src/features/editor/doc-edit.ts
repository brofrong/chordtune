import type { Item, Line, Section, SongDoc } from '@chordtune/chord-sheet';

/** Immutable edits of a song document for the visual editor. */

function withSection(doc: SongDoc, index: number, fn: (section: Section) => Section): SongDoc {
  return { ...doc, sections: doc.sections.map((s, i) => (i === index ? fn(s) : s)) };
}

export function updateSection(doc: SongDoc, index: number, patch: Partial<Section>): SongDoc {
  return withSection(doc, index, (section) => ({ ...section, ...patch }));
}

export function addSection(doc: SongDoc, label: string): SongDoc {
  const section: Section = { label, rhythm: null, lines: [{ type: 'line', items: [] }] };
  return { ...doc, sections: [...doc.sections, section] };
}

export function removeSection(doc: SongDoc, index: number): SongDoc {
  return { ...doc, sections: doc.sections.filter((_, i) => i !== index) };
}

export function setLineItems(doc: SongDoc, section: number, line: number, items: Item[]): SongDoc {
  return withSection(doc, section, (s) => ({
    ...s,
    lines: s.lines.map((l, i) => (i === line ? { type: 'line', items } : l)),
  }));
}

export function insertLine(doc: SongDoc, section: number, at: number, line: Line): SongDoc {
  return withSection(doc, section, (s) => ({
    ...s,
    lines: [...s.lines.slice(0, at), line, ...s.lines.slice(at)],
  }));
}

export function removeLine(doc: SongDoc, section: number, line: number): SongDoc {
  return withSection(doc, section, (s) => ({ ...s, lines: s.lines.filter((_, i) => i !== line) }));
}
