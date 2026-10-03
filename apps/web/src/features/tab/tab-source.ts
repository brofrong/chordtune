export type BlockMeta = 'tempo' | 'ts';

/** A command's own text: the keyword and, right after it, its argument if any — captured so a
 *  half-typed value (`\tempo 1`) round-trips, and so whatever else shares its line is untouched. */
const COMMAND_RE: Record<BlockMeta, RegExp> = {
  tempo: /\\tempo\b[ \t]*(\d*)/,
  ts: /\\ts\b[ \t]*(\d+[ \t]+\d+|\d*)/,
};

/** Any of the block's metadata commands, to find where the leading metadata of a line ends —
 *  `\tempo`, `\ts` and `\lyrics "…"`, in whatever order and however many share a line, exactly
 *  as the parser reads them before the first note or beat. */
const META_COMMAND_RE =
  /^[ \t]*\\(?:tempo\b[ \t]*\d*|ts\b[ \t]*(?:\d+[ \t]+\d+|\d*)|lyrics\b[ \t]*"[^"]*")/;

/**
 * The line and column where a block's leading metadata ends: a blank remainder doesn't count as
 * a note, so metadata commands can be spread across several lines or share one with each other.
 */
function metaEnd(source: readonly string[]): { line: number; col: number } {
  for (let line = 0; line < source.length; line++) {
    let col = 0;
    for (let match = META_COMMAND_RE.exec((source[line] ?? '').slice(col)); match; ) {
      col += match[0].length;
      match = META_COMMAND_RE.exec((source[line] ?? '').slice(col));
    }
    if ((source[line] ?? '').slice(col).trim() !== '') {
      return { line, col };
    }
  }
  return { line: source.length, col: 0 };
}

/** The argument of `\tempo` / `\ts` in a block's leading metadata, as written. */
export function readBlockMeta(source: readonly string[], command: BlockMeta): string | null {
  const end = metaEnd(source);
  for (let i = 0; i <= end.line && i < source.length; i++) {
    const line = source[i] ?? '';
    const text = i === end.line ? line.slice(0, end.col) : line;
    const match = COMMAND_RE[command].exec(text);
    if (match) {
      return match[1] ?? '';
    }
  }
  return null;
}

/**
 * Sets, edits or removes `\tempo` / `\ts` in a block's leading metadata, touching only the
 * command's own text: another command sharing its line, or notes sharing a one-line block, are
 * left as they are. `null` removes it, dropping the line if that leaves it blank; adding one
 * that's absent prepends it as its own first line.
 */
export function setBlockMeta(
  source: readonly string[],
  command: BlockMeta,
  value: string | null,
): string[] {
  const end = metaEnd(source);
  for (let i = 0; i <= end.line && i < source.length; i++) {
    const line = source[i] ?? '';
    const text = i === end.line ? line.slice(0, end.col) : line;
    const match = COMMAND_RE[command].exec(text);
    if (!match) {
      continue;
    }
    const start = match.index;
    const matchEnd = start + match[0].length;
    const lines = [...source];
    if (value !== null) {
      lines[i] = `${line.slice(0, start)}\\${command} ${value}${line.slice(matchEnd)}`;
      return lines;
    }
    // Eat one run of adjacent spaces so removal doesn't leave a double space or an orphan one.
    const beforeRaw = line.slice(0, start);
    const before = beforeRaw.replace(/[ \t]+$/, '');
    const afterRaw = line.slice(matchEnd);
    const after = before.length === beforeRaw.length ? afterRaw.replace(/^[ \t]+/, '') : afterRaw;
    const newLine = before + after;
    if (newLine.trim() === '') {
      lines.splice(i, 1);
    } else {
      lines[i] = newLine;
    }
    return lines;
  }
  return value === null ? [...source] : [`\\${command} ${value}`, ...source];
}
