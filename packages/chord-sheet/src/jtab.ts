const EVEN_COUNTS = new Set([1, 2, 4, 8, 16]);
const STRING_RE = /^\$([1-6])$/;
const FRET_RE = /^\d{1,2}$/;

/** `$5 0 $3 5` → `['0.5', '5.3']`; `null` when anything else is in the bar. */
function barNotes(bar: string): string[] | null {
  const tokens = bar.split(/\s+/).filter(Boolean);
  if (tokens.length % 2 !== 0) {
    return null;
  }
  const notes: string[] = [];
  for (let i = 0; i < tokens.length; i += 2) {
    const string = STRING_RE.exec(tokens[i] ?? '')?.[1];
    const fret = tokens[i + 1] ?? '';
    if (!string || !FRET_RE.test(fret)) {
      return null;
    }
    notes.push(`${fret}.${string}`);
  }
  return notes;
}

/**
 * Obsidian jtab (`$string fret`, bars split by `|`) → alphaTex, when every bar has the same
 * 1, 2, 4, 8 or 16 notes: they become `:N` notes in 4/4. Otherwise `null`: the timing is unknown.
 */
export function jtabToAlphaTex(source: string): string[] | null {
  const rows = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) =>
      line
        .split('|')
        .map((bar) => bar.trim())
        .filter(Boolean)
        .map(barNotes),
    );
  const bars = rows.flat();
  const count = bars[0]?.length ?? 0;
  if (
    bars.length === 0 ||
    !EVEN_COUNTS.has(count) ||
    bars.some((bar) => bar === null || bar.length !== count)
  ) {
    return null;
  }
  return rows.map(
    (row, index) =>
      `${index === 0 ? `:${count} ` : ''}${row.map((bar) => (bar ?? []).join(' ')).join(' | ')} |`,
  );
}
