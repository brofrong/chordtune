import { fromChordsOverLyrics, isChordLine } from './chords-over-lyrics';
import { parseHeader } from './parse';
import { parsePickNotation, parseStrumNotation, type Rhythm, type RhythmDraft } from './rhythm';
import { serialize } from './serialize';
import type { Diagnostic, SongDoc } from './types';

export type ImportedSong = {
  artist: string;
  title: string;
  /** Internal `${Chord}` format. */
  content: string;
  rhythms: Rhythm[];
  capo: number | null;
  tempo: number | null;
  notes: string;
  diagnostics: Diagnostic[];
};

const TITLE_RE = /^(.+?)\s+[-—–]\s+(.+)$/;
const HEADING_RE = /^#+\s*(.+)$/;
const CAPO_RE = /Каподастр\s*:\s*(\d+)/i;
const TEMPO_RE = /^\s*BPM\s*:\s*(\d*)/i;
const RHYTHM_LINE_RE = /^\s*(паттерн(?: гитары)?|бой|перебор)\s*:\s*(.*)$/i;
const RHYTHM_HEADER_RE = /^\s*\[(паттерн|бой|перебор)\s*:?\]\s*(.*)$/i;
const SECTION_LINE_RE =
  /^\s*((?:куплет|припев|пред-?припев|вступление|проигрыш|бридж|соло|кода|аутро|интро|verse|chorus|bridge|intro|outro|solo)(?:\s*\d+)?)\s*:\s*(.*)$/i;
const UNKNOWN_RE = /^(неизвестен|неизвестно|не указан|нет|-)?$/i;
const RHYTHM_KEYS = 'ABCDEFGHIJKLMNOP';

type Rhythms = { list: Rhythm[]; add(draft: RhythmDraft): string };

function createRhythms(): Rhythms {
  const list: Rhythm[] = [];
  return {
    list,
    add(draft) {
      const same = list.find(
        (rhythm) =>
          JSON.stringify({ ...rhythm, key: '' }) === JSON.stringify({ key: '', ...draft }),
      );
      if (same) {
        return same.key;
      }
      const key = RHYTHM_KEYS[list.length] ?? 'P';
      list.push({ key, ...draft });
      return key;
    },
  };
}

/** A rhythm line from the notes: `Бой: ↓↓↑↑↓↑`, `Перебор: Б-3-2-3`, `[бой:] ↓ ↓ ↑`. */
function readRhythmLine(line: string): { value: string; draft: RhythmDraft | null } | null {
  const match = RHYTHM_LINE_RE.exec(line) ?? RHYTHM_HEADER_RE.exec(line);
  if (!match) {
    return null;
  }
  const kind = (match[1] ?? '').toLowerCase();
  const value = (match[2] ?? '').trim();
  if (UNKNOWN_RE.test(value)) {
    return { value: '', draft: null };
  }
  const draft =
    kind === 'бой'
      ? parseStrumNotation(value)
      : kind === 'перебор'
        ? parsePickNotation(value)
        : (parsePickNotation(value) ?? parseStrumNotation(value));
  return { value, draft };
}

function sectionKey(label: string): string {
  return label.toLowerCase().replace(/\d+/g, '').trim();
}

function artistAndTitle(markdown: string, fileName?: string): [string, string] {
  const firstLine = markdown.split('\n').find((line) => line.trim() !== '') ?? '';
  const heading = HEADING_RE.exec(firstLine.trim())?.[1];
  const candidates = [heading, fileName?.replace(/\.md$/i, '')];
  for (const candidate of candidates) {
    const match = candidate ? TITLE_RE.exec(candidate.trim()) : null;
    if (match) {
      return [(match[1] ?? '').trim(), (match[2] ?? '').trim()];
    }
  }
  return ['', (heading ?? fileName ?? '').trim()];
}

/**
 * Converts a guitar note from Obsidian: `#Artist - Title`, meta lines (`Каподастр:`, `BPM:`,
 * `Бой:`/`Перебор:`/`Паттерн:`) and ```chords blocks with chords over lyrics.
 * Everything else goes to `notes`.
 */
export function importObsidian(markdown: string, fileName?: string): ImportedSong {
  const [artist, title] = artistAndTitle(markdown, fileName);
  const rhythms = createRhythms();
  const sectionRhythm = new Map<string, string>();
  let defaultRhythm: string | null = null;
  let capo: number | null = null;
  let tempo: number | null = null;
  const notes: string[] = [];
  const sheet: string[] = [];

  const readMeta = (line: string, section: string | null): boolean => {
    const capoMatch = CAPO_RE.exec(line);
    if (capoMatch) {
      capo = Number(capoMatch[1]);
    }
    const tempoMatch = TEMPO_RE.exec(line);
    if (tempoMatch) {
      tempo = tempoMatch[1] ? Number(tempoMatch[1]) : null;
      return true;
    }
    const rhythm = readRhythmLine(line);
    if (!rhythm) {
      return capoMatch !== null && line.trim().startsWith(capoMatch[0]);
    }
    if (rhythm.draft) {
      const key = rhythms.add(rhythm.draft);
      if (section === null) {
        defaultRhythm ??= key;
      } else if (!sectionRhythm.has(section)) {
        sectionRhythm.set(section, key);
      }
    } else if (rhythm.value) {
      notes.push(line.trim());
    }
    return true;
  };

  const lines = markdown.split('\n');
  let fence: string | null = null;
  let section: string | null = null;
  let titleSkipped = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (fence === null) {
      if (trimmed.startsWith('```')) {
        fence = trimmed.slice(3).trim();
        if (fence !== 'chords') {
          notes.push(trimmed);
        } else if (sheet.length > 0) {
          sheet.push('');
        }
        continue;
      }
      if (!titleSkipped && trimmed) {
        titleSkipped = true;
        if (HEADING_RE.test(trimmed)) {
          continue;
        }
      }
      if (!readMeta(line, null) && trimmed) {
        notes.push(line.trimEnd());
      }
      continue;
    }

    if (trimmed === '```') {
      if (fence !== 'chords') {
        notes.push(trimmed);
      }
      fence = null;
      continue;
    }
    if (fence !== 'chords') {
      notes.push(line.trimEnd());
      continue;
    }

    if (readMeta(line, section)) {
      continue;
    }
    const sectionLine = SECTION_LINE_RE.exec(line);
    const rest = sectionLine?.[2]?.trim() ?? '';
    if (sectionLine && (!rest || isChordLine(rest))) {
      const label = (sectionLine[1] ?? '').trim();
      section = sectionKey(label);
      sheet.push(`[${label}]`);
      if (rest) {
        sheet.push(rest);
      }
      continue;
    }
    const header = parseHeader(line);
    if (header) {
      section = sectionKey(header.label);
    }
    sheet.push(line);
  }

  const { doc, diagnostics } = fromChordsOverLyrics(trimBlankLines(sheet).join('\n'));
  markSectionRhythms(doc, sectionRhythm, defaultRhythm ?? rhythms.list[0]?.key ?? null);

  return {
    artist,
    title,
    content: serialize(doc),
    rhythms: rhythms.list,
    capo,
    tempo,
    notes: notes
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim(),
    diagnostics,
  };
}

function trimBlankLines(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.trim() !== '');
  if (start === -1) {
    return [];
  }
  const end = lines.findLastIndex((line) => line.trim() !== '');
  return lines.slice(start, end + 1);
}

/**
 * A rhythm written inside a section applies to every section with that name (all choruses).
 * Other sections go back to the default rhythm, marked only where the rhythm changes.
 */
function markSectionRhythms(
  doc: SongDoc,
  sectionRhythm: Map<string, string>,
  defaultRhythm: string | null,
) {
  if (sectionRhythm.size === 0) {
    return;
  }
  let current = defaultRhythm;
  for (const section of doc.sections) {
    const wanted =
      (section.label === null ? null : sectionRhythm.get(sectionKey(section.label))) ??
      defaultRhythm;
    if (wanted !== null && wanted !== current) {
      section.rhythm = wanted;
      current = wanted;
    }
  }
}
