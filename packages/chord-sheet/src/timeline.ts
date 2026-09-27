import type { Rhythm } from './rhythm';
import { barQuarters, type TabBlock, tabQuarters } from './tab';
import type { Item, SongDoc } from './types';

type Place = {
  /** Bar number from 0. */
  bar: number;
  /** Start and length in bars (of the rhythm's time for chords, of the block's for tabs). */
  start: number;
  length: number;
  section: number;
  line: number;
  /** `\tempo` of a block, else the section's; `null` takes the song's. */
  tempo: number | null;
};

export type ChordEvent = Place & {
  kind: 'chord';
  chord: string;
  /** Key of the rhythm pattern, `null` when the song has none. */
  rhythm: string | null;
  /** Index of the chord item in its line. */
  item: number;
};

export type TabEvent = Place & { kind: 'tab'; block: TabBlock };

export type TimelineEvent = ChordEvent | TabEvent;

type Unplaced = Omit<ChordEvent, 'bar'> | Omit<TabEvent, 'bar'>;

/** Splits a line into bar groups. A line without `|` is one group where every chord is a bar. */
function groups(items: Item[]): { item: Item; index: number }[][] {
  const result: { item: Item; index: number }[][] = [[]];
  items.forEach((item, index) => {
    if (item.type === 'bar') {
      result.push([]);
    } else {
      result.at(-1)?.push({ item, index });
    }
  });
  return result;
}

/**
 * Flattens a song into chords and tabs with their place in time. Without `|` every chord is one
 * bar; with `|` the chords of a bar share it evenly, a bar with only text holds the previous
 * chord. `@X` switches the rhythm until the next marker, across sections. alphaTex blocks become
 * one tab event each, as long as their bars; ASCII tabs take no time.
 */
export function timeline(doc: SongDoc, rhythms: readonly Rhythm[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  let rhythm = rhythms[0]?.key ?? null;
  let position = 0;

  const push = (event: Unplaced) => {
    events.push({ ...event, bar: Math.floor(event.start + 1e-9) } as TimelineEvent);
    position = event.start + event.length;
  };

  doc.sections.forEach((section, sectionIndex) => {
    if (section.rhythm) {
      rhythm = section.rhythm;
    }
    section.lines.forEach((line, lineIndex) => {
      if (line.type === 'tab') {
        return;
      }
      if (line.type === 'alphatex') {
        const quarters = tabQuarters(line.block);
        if (quarters > 0) {
          push({
            kind: 'tab',
            block: line.block,
            tempo: line.block.tempo ?? section.tempo,
            start: position,
            length: quarters / barQuarters(line.block.time),
            section: sectionIndex,
            line: lineIndex,
          });
        }
        return;
      }
      const barred = line.items.some((item) => item.type === 'bar');
      let repeatFrom = events.length;

      for (const entries of groups(line.items)) {
        const chordCount = entries.filter(({ item }) => item.type === 'chord').length;
        const hasText = entries.some(({ item }) => item.type === 'text' && item.text.trim());
        const length = barred && chordCount > 0 ? 1 / chordCount : 1;

        for (const { item, index } of entries) {
          if (item.type === 'rhythm') {
            rhythm = item.key;
          } else if (item.type === 'chord') {
            push({
              kind: 'chord',
              chord: item.chord,
              rhythm,
              tempo: section.tempo,
              start: position,
              length,
              section: sectionIndex,
              line: lineIndex,
              item: index,
            });
          } else if (item.type === 'repeat') {
            const phrase = events.slice(repeatFrom);
            const phraseStart = phrase[0]?.start ?? position;
            const phraseLength = position - phraseStart;
            for (let time = 1; time < item.times; time++) {
              for (const event of phrase) {
                push({ ...event, start: event.start + phraseLength * time });
              }
            }
            repeatFrom = events.length;
          }
        }

        const previous = events.at(-1);
        if (barred && chordCount === 0 && hasText && previous) {
          previous.length += 1;
          position += 1;
        }
      }
    });
  });

  return events;
}
