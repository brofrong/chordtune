export type Item =
  /** Raw chord as written, e.g. `F#m7/C#` or `Hm`. */
  | { type: 'chord'; chord: string }
  | { type: 'text'; text: string }
  | { type: 'bar' }
  | { type: 'rhythm'; key: string }
  | { type: 'repeat'; times: number };

/** A line without chord, bar, rhythm or repeat items is plain text. */
export type Line = { type: 'line'; items: Item[] } | { type: 'tab'; lines: string[] };

export type Section = { label: string | null; rhythm: string | null; lines: Line[] };

export type SongDoc = { meta: Record<string, string>; sections: Section[] };

/** `line` and `col` are 1-based positions in the serialized source. */
export type Diagnostic = {
  line: number;
  col: number;
  severity: 'warning' | 'error';
  message: string;
};
