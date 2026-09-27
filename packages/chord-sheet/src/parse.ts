import { parseAlphaTex } from './alphatex';
import { isChord } from './chord';
import { isTempo, MAX_TEMPO, MIN_TEMPO } from './tempo';
import type { Diagnostic, Item, Line, Section, SongDoc } from './types';

const META_RE = /^\{(\w+):\s*(.*?)\s*\}$/;
const HEADER_RE = /^\[([^\]]+)\](?:\s*@([A-Z]))?(?:\s*(\d+)\s*bpm)?\s*$/;
const REPEAT_RE = /^[x×]([1-9]\d*)$/;
const RHYTHM_KEY_RE = /[A-Z]/;

export const TAB_START = '{start_of_tab}';
export const TAB_END = '{end_of_tab}';
export const ALPHATEX_START = '{start_of_alphatex}';
export const ALPHATEX_END = '{end_of_alphatex}';

export type Header = { label: string; rhythm: string | null; tempo: number | null };

/** `[Соло] @B 140bpm`. The tempo is as written; `sectionFromHeader` checks its range. */
export function parseHeader(text: string): Header | null {
  const match = HEADER_RE.exec(text);
  return match
    ? {
        label: match[1] ?? '',
        rhythm: match[2] ?? null,
        tempo: match[3] ? Number(match[3]) : null,
      }
    : null;
}

/** A new section from its header; a tempo out of range is dropped with a warning. */
export function sectionFromHeader(
  header: Header,
  lineNo: number,
  diagnostics: Diagnostic[],
): Section {
  let { tempo } = header;
  if (tempo !== null && !isTempo(tempo)) {
    diagnostics.push({
      line: lineNo,
      col: 1,
      severity: 'warning',
      message: `Tempo must be ${MIN_TEMPO}–${MAX_TEMPO}: ${tempo}`,
    });
    tempo = null;
  }
  return { ...header, tempo, lines: [] };
}

export function isBlockStart(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === TAB_START || trimmed === ALPHATEX_START;
}

/**
 * Reads the block opened at `lines[start]` (`{start_of_tab}` or `{start_of_alphatex}`).
 * `end` is the index of the closing fence, or of the last line when it is missing.
 */
export function readBlock(
  lines: readonly string[],
  start: number,
  diagnostics: Diagnostic[],
): { line: Line; end: number } {
  const open = (lines[start] ?? '').trim();
  const close = open === TAB_START ? TAB_END : ALPHATEX_END;
  const body: string[] = [];
  let end = start + 1;
  for (; end < lines.length; end++) {
    const text = lines[end] ?? '';
    if (text.trim() === close) {
      break;
    }
    body.push(text);
  }
  if (end >= lines.length) {
    diagnostics.push({ line: start + 1, col: 1, severity: 'error', message: `Unclosed ${open}` });
    end = lines.length - 1;
  }
  if (open === TAB_START) {
    return { line: { type: 'tab', lines: body }, end };
  }
  const parsed = parseAlphaTex(body, start + 2);
  diagnostics.push(...parsed.diagnostics);
  return { line: { type: 'alphatex', source: body, block: parsed.block }, end };
}

export function parseMeta(text: string): [key: string, value: string] | null {
  const match = META_RE.exec(text);
  return match ? [match[1] ?? '', match[2] ?? ''] : null;
}

/** Parses the internal `${Chord}` format. Never throws: problems become diagnostics. */
export function parse(source: string): { doc: SongDoc; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const meta: Record<string, string> = {};
  const lines = source.split('\n');
  let current: Section = { label: null, rhythm: null, tempo: null, lines: [] };
  const sections: Section[] = [current];

  let i = 0;
  for (; i < lines.length; i++) {
    const entry = parseMeta(lines[i] ?? '');
    if (!entry) {
      break;
    }
    meta[entry[0]] = entry[1];
  }

  for (; i < lines.length; i++) {
    const text = lines[i] ?? '';
    const header = parseHeader(text);
    if (header) {
      current = sectionFromHeader(header, i + 1, diagnostics);
      sections.push(current);
      continue;
    }
    if (isBlockStart(text)) {
      const block = readBlock(lines, i, diagnostics);
      current.lines.push(block.line);
      i = block.end;
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
