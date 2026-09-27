import type { TabBlock } from './tab';

export type Item =
  /** Raw chord as written, e.g. `F#m7/C#` or `Hm`. */
  | { type: 'chord'; chord: string }
  | { type: 'text'; text: string }
  | { type: 'bar' }
  | { type: 'rhythm'; key: string }
  | { type: 'repeat'; times: number };

/** A line without chord, bar, rhythm or repeat items is plain text. */
export type Line =
  | { type: 'line'; items: Item[] }
  /** ASCII tab: shown as is, takes no time. */
  | { type: 'tab'; lines: string[] }
  | { type: 'alphatex'; source: string[]; block: TabBlock };

/** `tempo` overrides the song tempo for this section only. */
export type Section = {
  label: string | null;
  rhythm: string | null;
  tempo: number | null;
  lines: Line[];
};

export type SongDoc = { meta: Record<string, string>; sections: Section[] };

/** `line` and `col` are 1-based positions in the serialized source. */
export type Diagnostic = {
  line: number;
  col: number;
  severity: 'warning' | 'error';
  message: string;
};
