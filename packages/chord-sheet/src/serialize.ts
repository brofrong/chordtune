import { ALPHATEX_END, ALPHATEX_START, TAB_END, TAB_START } from './parse';
import type { Item, Line, Section, SongDoc } from './types';

export function serializeItem(item: Item): string {
  switch (item.type) {
    case 'chord':
      return `\${${item.chord}}`;
    case 'text':
      return item.text;
    case 'bar':
      return '|';
    case 'rhythm':
      return `@${item.key}`;
    case 'repeat':
      return `\${x${item.times}}`;
  }
}

export function serializeHeader(section: Section): string {
  const rhythm = section.rhythm ? ` @${section.rhythm}` : '';
  const tempo = section.tempo ? ` ${section.tempo}bpm` : '';
  return `[${section.label ?? ''}]${rhythm}${tempo}`;
}

/** A tab or alphaTex block with its fences. */
export function serializeBlock(line: Exclude<Line, { type: 'line' }>): string[] {
  return line.type === 'tab'
    ? [TAB_START, ...line.lines, TAB_END]
    : [ALPHATEX_START, ...line.source, ALPHATEX_END];
}

export function serialize(doc: SongDoc): string {
  const out = Object.entries(doc.meta).map(([key, value]) => `{${key}: ${value}}`);
  for (const section of doc.sections) {
    if (section.label !== null) {
      out.push(serializeHeader(section));
    }
    for (const line of section.lines) {
      if (line.type === 'line') {
        out.push(line.items.map(serializeItem).join(''));
      } else {
        out.push(...serializeBlock(line));
      }
    }
  }
  return out.join('\n');
}
