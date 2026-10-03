import { type TabBlock, tabBeats } from '@chordtune/chord-sheet';

import { OPEN_STRING_MIDI } from './guitar-synth';
import type { ScheduledNote } from './strum-schedule';

const TAB_GAIN = 0.9;
const DEAD_GAIN = 0.8;
const PALM_MUTE_GAIN = 0.7;
/** A note reached by a hammer-on is not picked. */
const LEGATO_GAIN = 0.55;

/**
 * Tab notes in time from the start of the block (repeats unrolled). Tied notes ring on,
 * dead notes and palm mute are muted, the target of `h` sounds softer; slide, bend and
 * vibrato sound as plain notes.
 */
export function scheduleTab(
  block: TabBlock,
  options: { bpm: number; capo?: number; strings?: readonly number[] },
): ScheduledNote[] {
  const quarterSec = 60 / options.bpm;
  const capo = options.capo ?? 0;
  const strings = options.strings ?? OPEN_STRING_MIDI;
  const legato = new Set<number>();
  const notes: ScheduledNote[] = [];

  for (const { bar, beat: beatIndex, start } of tabBeats(block)) {
    const beat = block.bars[bar]?.beats[beatIndex];
    if (!beat) {
      continue;
    }
    // A string reached by a hammer-on sounds soft only on the very next beat; a rest still
    // counts as a beat, so the flag must not carry over it to a later note.
    const legatoHere = new Set(legato);
    legato.clear();
    for (const note of beat.notes) {
      if (note.tie) {
        continue;
      }
      const dead = note.fret === 'x';
      let gain = dead ? DEAD_GAIN : TAB_GAIN;
      if (beat.palmMute) {
        gain *= PALM_MUTE_GAIN;
      }
      if (legatoHere.has(note.string)) {
        gain *= LEGATO_GAIN;
      }
      if (note.effects.hammer) {
        legato.add(note.string);
      }
      const open = strings[strings.length - note.string] ?? strings[0];
      notes.push({
        time: start * quarterSec,
        midi: open + (note.fret === 'x' ? 0 : note.fret) + capo,
        string: note.string,
        gain,
        muted: dead || beat.palmMute,
      });
    }
  }
  return notes;
}
