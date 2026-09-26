import { eventSeconds, scheduleNotes } from '@chordtune/audio';
import {
  barBeats,
  type Rhythm,
  type SongDoc,
  type TimelineEvent,
  timeline,
} from '@chordtune/chord-sheet';

export const DEFAULT_BPM = 90;
export const DEFAULT_PREVIEW_CHORD = 'Am';

/** One bar of a pattern on one chord, to loop in the pattern editor. */
export function patternPlayback(rhythm: Rhythm, chord: string, bpm: number) {
  const event: TimelineEvent = {
    chord,
    rhythm: rhythm.key,
    bar: 0,
    start: 0,
    length: 1,
    section: 0,
    line: 0,
    item: 0,
  };
  return {
    notes: scheduleNotes([event], [rhythm], { bpm }),
    loopSec: (barBeats(rhythm.time) * 60) / bpm,
  };
}

/** The chords of one section in time, plus when each one starts, for highlighting. */
export function sectionPlayback(doc: SongDoc, rhythms: Rhythm[], section: number, bpm: number) {
  const events = timeline(doc, rhythms).filter((event) => event.section === section);
  return {
    events,
    seconds: eventSeconds(events, rhythms, bpm),
    notes: scheduleNotes(events, rhythms, { bpm }),
  };
}
