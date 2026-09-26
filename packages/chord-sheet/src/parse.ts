import { isChord } from './chord';
import type { Diagnostic, Item, Section, SongDoc } from './types';

const META_RE = /^\{(\w+):\s*(.*?)\s*\}$/;
const HEADER_RE = /^\[([^\]]+)\](?:\s*@([A-Z]))?\s*$/;
const REPEAT_RE = /^[x×]([1-9]\d*)$/;
const RHYTHM_KEY_RE = /[A-Z]/;

export const TAB_START = '{start_of_tab}';
export const TAB_END = '{end_of_tab}';

/** Parses the internal `${Chord}` format. Never throws: problems become diagnostics. */
export function parse(source: string): { doc: SongDoc; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const meta: Record<string, string> = {};
  const lines = source.split('\n');
  let current: Section = { label: null, rhythm: null, lines: [] };
  const sections: Section[] = [current];

  let i = 0;
  for (; i < lines.length; i++) {
    const match = META_RE.exec(lines[i] ?? '');
    if (!match) {
      break;
    }
    meta[match[1] ?? ''] = match[2] ?? '';
  }

  for (; i < lines.length; i++) {
    const text = lines[i] ?? '';
    const header = HEADER_RE.exec(text);
    if (header) {
      current = { label: header[1] ?? '', rhythm: header[2] ?? null, lines: [] };
      sections.push(current);
      continue;
    }
    if (text.trim() === TAB_START) {
      const start = i;
      const tab: string[] = [];
      let closed = false;
      for (i++; i < lines.length; i++) {
        const tabLine = lines[i] ?? '';
        if (tabLine.trim() === TAB_END) {
          closed = true;
          break;
        }
        tab.push(tabLine);
      }
      if (!closed) {
        diagnostics.push({
          line: start + 1,
          col: 1,
          severity: 'error',
          message: `Unclosed ${TAB_START}`,
        });
      }
      current.lines.push({ type: 'tab', lines: tab });
      continue;
    }
    current.lines.push({ type: 'line', items: parseItems(text, i + 1, diagnostics) });
  }

  return {
    doc: { meta, sections: sections.filter((s) => s.label !== null || s.lines.length > 0) },
    diagnostics,
  };
}

function parseItems(text: string, lineNo: number, diagnostics: Diagnostic[]): Item[] {
  const items: Item[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) {
      items.push({ type: 'text', text: buffer });
      buffer = '';
    }
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];
    const next = text[i + 1] ?? '';
    if (char === '$' && next === '{') {
      const end = text.indexOf('}', i + 2);
      if (end === -1) {
        diagnostics.push({ line: lineNo, col: i + 1, severity: 'error', message: 'Unclosed ${' });
        buffer += text.slice(i);
        break;
      }
      flush();
      const inner = text.slice(i + 2, end);
      const repeat = REPEAT_RE.exec(inner);
      if (repeat) {
        items.push({ type: 'repeat', times: Number(repeat[1]) });
      } else {
        if (!isChord(inner)) {
          diagnostics.push({
            line: lineNo,
            col: i + 1,
            severity: 'warning',
            message: `Not a chord: ${inner}`,
          });
        }
        items.push({ type: 'chord', chord: inner });
      }
      i = end + 1;
    } else if (char === '|') {
      flush();
      items.push({ type: 'bar' });
      i++;
    } else if (char === '@' && RHYTHM_KEY_RE.test(next)) {
      flush();
      items.push({ type: 'rhythm', key: next });
      i += 2;
    } else {
      buffer += char;
      i++;
    }
  }
  flush();
  return items;
}
