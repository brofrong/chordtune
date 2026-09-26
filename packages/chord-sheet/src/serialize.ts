import { TAB_END, TAB_START } from './parse';
import type { Item, Section, SongDoc } from './types';

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
  return `[${section.label ?? ''}]${section.rhythm ? ` @${section.rhythm}` : ''}`;
}

export function serialize(doc: SongDoc): string {
  const out = Object.entries(doc.meta).map(([key, value]) => `{${key}: ${value}}`);
  for (const section of doc.sections) {
    if (section.label !== null) {
      out.push(serializeHeader(section));
    }
    for (const line of section.lines) {
      if (line.type === 'tab') {
        out.push(TAB_START, ...line.lines, TAB_END);
      } else {
        out.push(line.items.map(serializeItem).join(''));
      }
    }
  }
  return out.join('\n');
}
