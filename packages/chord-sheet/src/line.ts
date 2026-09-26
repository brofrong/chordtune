import type { Item } from './types';

export type Mark = { pos: number; item: Exclude<Item, { type: 'text' }> };

/** A line as its text plus chords, bars, markers and repeats pinned to character positions. */
export function splitLine(items: readonly Item[]): { text: string; marks: Mark[] } {
  let text = '';
  const marks: Mark[] = [];
  for (const item of items) {
    if (item.type === 'text') {
      text += item.text;
    } else {
      marks.push({ pos: text.length, item });
    }
  }
  return { text, marks };
}

/** Inverse of `splitLine`; marks are sorted by position, keeping their order within one. */
export function joinLine(text: string, marks: readonly Mark[]): Item[] {
  const sorted = marks
    .map((mark, index) => ({ ...mark, pos: Math.min(Math.max(mark.pos, 0), text.length), index }))
    .sort((a, b) => a.pos - b.pos || a.index - b.index);
  const items: Item[] = [];
  let pos = 0;
  for (const mark of sorted) {
    if (mark.pos > pos) {
      items.push({ type: 'text', text: text.slice(pos, mark.pos) });
      pos = mark.pos;
    }
    items.push(mark.item);
  }
  if (text.length > pos) {
    items.push({ type: 'text', text: text.slice(pos) });
  }
  return items;
}
