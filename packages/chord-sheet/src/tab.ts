export type TabDuration = 1 | 2 | 4 | 8 | 16 | 32;

/** `hammer` and `slide` lead to the next note on the same string; `bend` is in quarter tones. */
export type NoteEffects = { hammer?: true; slide?: true; bend?: number[]; vibrato?: true };

/** `string` 1 is the high E. A tie holds the previous fret on the string without a new attack. */
export type TabNote = { string: number; fret: number | 'x'; tie: boolean; effects: NoteEffects };

export type TabBeat = {
  /** Length in quarter notes, with the dot and the tuplet applied. */
  quarters: number;
  duration: TabDuration;
  dotted: boolean;
  tuplet: number | null;
  /** Empty for a rest. */
  notes: TabNote[];
  text: string | null;
  syllable: string | null;
  palmMute: boolean;
  letRing: boolean;
};

export type TabBar = { beats: TabBeat[]; repeatOpen: boolean; repeatClose: number | null };

export type TabBlock = {
  /** `\tempo`; `null` takes the section's or the song's. */
  tempo: number | null;
  time: [number, number];
  /** As written, for drawing with repeat signs. */
  bars: TabBar[];
  /** Indices into `bars` with repeats unrolled, for time and sound. */
  playOrder: number[];
};

export type TabBeatTime = {
  /** Index into `bars`. */
  bar: number;
  /** Index into the bar's beats. */
  beat: number;
  /** Quarter notes from the start of the block. */
  start: number;
  quarters: number;
};

/** Quarter notes in a bar of `n/m`. */
export function barQuarters(time: [number, number]): number {
  return (time[0] * 4) / time[1];
}

/** Every beat in play order (repeats unrolled) with its start. */
export function tabBeats(block: TabBlock): TabBeatTime[] {
  const beats: TabBeatTime[] = [];
  let at = 0;
  for (const bar of block.playOrder) {
    block.bars[bar]?.beats.forEach((beat, index) => {
      beats.push({ bar, beat: index, start: at, quarters: beat.quarters });
      at += beat.quarters;
    });
  }
  return beats;
}

/** Length of the block in quarter notes, repeats included. */
export function tabQuarters(block: TabBlock): number {
  let total = 0;
  for (const bar of block.playOrder) {
    for (const beat of block.bars[bar]?.beats ?? []) {
      total += beat.quarters;
    }
  }
  return total;
}
