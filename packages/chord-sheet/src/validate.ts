import { serializeItem } from './serialize';
import type { Diagnostic, SongDoc } from './types';

/** Errors that must block saving: rhythm markers pointing at a missing pattern. */
export function validate(doc: SongDoc, rhythms: readonly { key: string }[]): Diagnostic[] {
  const keys = new Set(rhythms.map((rhythm) => rhythm.key));
  const diagnostics: Diagnostic[] = [];
  const check = (key: string, line: number, col: number) => {
    if (!keys.has(key)) {
      diagnostics.push({ line, col, severity: 'error', message: `Unknown rhythm: ${key}` });
    }
  };

  // Line numbers follow `serialize`: meta lines, then headers and lines, tabs with their fences.
  let lineNo = Object.keys(doc.meta).length;
  for (const section of doc.sections) {
    if (section.label !== null) {
      lineNo++;
      if (section.rhythm) {
        check(section.rhythm, lineNo, section.label.length + 4);
      }
    }
    for (const line of section.lines) {
      if (line.type !== 'line') {
        lineNo += (line.type === 'tab' ? line.lines.length : line.source.length) + 2;
        continue;
      }
      lineNo++;
      let col = 1;
      for (const item of line.items) {
        if (item.type === 'rhythm') {
          check(item.key, lineNo, col);
        }
        col += serializeItem(item).length;
      }
    }
  }
  return diagnostics;
}
