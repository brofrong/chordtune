import { isChord } from './chord';
import { parseHeader, parseMeta, TAB_END, TAB_START } from './parse';
import { serializeHeader } from './serialize';
import type { Diagnostic, Item, Section, SongDoc } from './types';

const TOKEN_RE = /\||[^\s|]+/g;
const RHYTHM_RE = /^@([A-Z])$/;
const REPEAT_RE = /^[({}]?[x×]([1-9]\d*)[)}]?$/;
const TAB_LINE_RE = /^\s*[eBGDAEHbgdah]?\|*[-\d|~hpbrx/\\ ]{6,}\|?\s*$/;

type Token = { col: number; item: Item };

function tokenItem(token: string): Item | null {
  if (token === '|') {
    return { type: 'bar' };
  }
  const rhythm = RHYTHM_RE.exec(token);
  if (rhythm) {
    return { type: 'rhythm', key: rhythm[1] ?? '' };
  }
  const repeat = REPEAT_RE.exec(token);
  if (repeat) {
    return { type: 'repeat', times: Number(repeat[1]) };
  }
  return isChord(token) ? { type: 'chord', chord: token } : null;
}

/** Tokens of a chord line with their columns, or null if the line is not a chord line. */
function chordTokens(line: string): Token[] | null {
  const tokens: Token[] = [];
  let hasChordOrBar = false;
  for (const match of line.matchAll(TOKEN_RE)) {
    const item = tokenItem(match[0]);
    if (!item) {
      return null;
    }
    hasChordOrBar ||= item.type === 'chord' || item.type === 'bar';
    tokens.push({ col: match.index, item });
  }
  return hasChordOrBar ? tokens : null;
}

export function isChordLine(line: string): boolean {
  return chordTokens(line) !== null;
}

function isTabLike(line: string): boolean {
  return line.includes('---') && TAB_LINE_RE.test(line);
}

function isLyric(line: string | undefined): line is string {
  return (
    line !== undefined &&
    line.trim() !== '' &&
    !parseHeader(line) &&
    !isChordLine(line) &&
    !isTabLike(line) &&
    line.trim() !== TAB_START
  );
}

/** Puts chord tokens into the lyric at their columns, padding the lyric when a token is past its end. */
function mergeLine(tokens: Token[], lyric: string): Item[] {
  const items: Item[] = [];
  let pos = 0;
  for (const { col, item } of tokens) {
    if (col > pos) {
      items.push({ type: 'text', text: lyric.slice(pos, col).padEnd(col - pos) });
      pos = col;
    }
    items.push(item);
  }
  if (lyric.length > pos) {
    items.push({ type: 'text', text: lyric.slice(pos) });
  }
  return items;
}

export function fromChordsOverLyrics(text: string): { doc: SongDoc; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const meta: Record<string, string> = {};
  const lines = text.split('\n');
  let current: Section = { label: null, rhythm: null, lines: [] };
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
    const line = lines[i] ?? '';
    const header = parseHeader(line);
    if (header) {
      current = { ...header, lines: [] };
      sections.push(current);
      continue;
    }

    if (line.trim() === TAB_START) {
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

    if (isTabLike(line) && isTabLike(lines[i + 1] ?? '')) {
      const tab: string[] = [];
      while (i < lines.length && isTabLike(lines[i] ?? '')) {
        tab.push(lines[i] ?? '');
        i++;
      }
      i--;
      current.lines.push({ type: 'tab', lines: tab });
      continue;
    }

    const tokens = chordTokens(line);
    if (tokens) {
      const next = lines[i + 1];
      const lyric = isLyric(next) ? next : '';
      if (lyric) {
        i++;
      }
      current.lines.push({ type: 'line', items: mergeLine(tokens, lyric) });
      continue;
    }

    current.lines.push({ type: 'line', items: line ? [{ type: 'text', text: line }] : [] });
  }

  return {
    doc: { meta, sections: sections.filter((s) => s.label !== null || s.lines.length > 0) },
    diagnostics,
  };
}

function tokenText(item: Exclude<Item, { type: 'text' }>): string {
  switch (item.type) {
    case 'chord':
      return item.chord;
    case 'bar':
      return '|';
    case 'rhythm':
      return `@${item.key}`;
    case 'repeat':
      return `x${item.times}`;
  }
}

function renderLine(items: Item[]): string[] {
  let chords = '';
  let lyric = '';
  for (const item of items) {
    if (item.type === 'text') {
      lyric += item.text;
      continue;
    }
    // A token that would touch the previous one moves right, leaving one space.
    const col = chords ? Math.max(lyric.length, chords.length + 1) : lyric.length;
    chords = chords.padEnd(col) + tokenText(item);
  }
  if (!chords) {
    return [lyric];
  }
  return lyric.trim() ? [chords.trimEnd(), lyric.trimEnd()] : [chords.trimEnd()];
}

export function toChordsOverLyrics(doc: SongDoc): string {
  const out = Object.entries(doc.meta).map(([key, value]) => `{${key}: ${value}}`);
  for (const section of doc.sections) {
    if (section.label !== null) {
      out.push(serializeHeader(section));
    }
    for (const line of section.lines) {
      if (line.type === 'tab') {
        out.push(TAB_START, ...line.lines, TAB_END);
      } else {
        out.push(...renderLine(line.items));
      }
    }
  }
  return out.join('\n');
}
