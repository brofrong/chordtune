import {
  eventSeconds,
  type ScheduledNote,
  scheduleNotes,
  scheduleTab,
  strumShape,
  voicingFor,
} from '@chordtune/audio';
import {
  barBeats,
  chordKey,
  type Rhythm,
  type SongDoc,
  type SongTuning,
  songTuning,
  type TabBeatTime,
  type TabBlock,
  type TimelineEvent,
  tabBeats,
  timeline,
  type Voicings,
} from '@chordtune/chord-sheet';

export const DEFAULT_BPM = 90;
export const DEFAULT_PREVIEW_CHORD = 'Am';

/** How the song sounds: capo, tuning and the author's shapes. */
export type SongSound = { capo: number | null; tuning: SongTuning; voicings: Voicings };

/** `speed` plays everything that many times faster; tempo and bars stay as written. */
export type PlaybackOptions = { bpm: number; speed?: number } & Partial<SongSound>;

export function songSound(source: {
  capo: number | null;
  tuning?: string | null;
  voicings?: Voicings | null;
}): SongSound {
  return { capo: source.capo, tuning: songTuning(source.tuning), voicings: source.voicings ?? {} };
}

/** Capo plus the tuning's shift: how far every fretted note is moved. */
function soundCapo(capo: number | null | undefined, tuning: SongTuning): number {
  return (capo ?? 0) + tuning.shift;
}

/** One strum of a shape in the song's sound, for diagrams. */
export function shapePlayback(
  shape: readonly (number | null)[],
  sound: SongSound,
): ScheduledNote[] {
  return strumShape(shape, sound.tuning.strings, soundCapo(sound.capo, sound.tuning));
}

export type SongPlayback = {
  events: TimelineEvent[];
  /** Start and end of each event, at the chosen speed. */
  seconds: { start: number; end: number }[];
  /** Start of every beat of a tab event (in `tabBeats` order); `null` for chords. */
  beatStarts: (number[] | null)[];
  notes: ScheduledNote[];
};

export type ActiveBeat = { bar: number; beat: number };
export type PlayingAt = {
  section: number;
  line: number;
  item: number | null;
  beat: ActiveBeat | null;
};

function atSpeed(notes: ScheduledNote[], speed: number): ScheduledNote[] {
  return speed === 1 ? notes : notes.map((note) => ({ ...note, time: note.time / speed }));
}

function schedule(
  events: TimelineEvent[],
  rhythms: Rhythm[],
  { bpm, capo, speed = 1, tuning = songTuning('standard'), voicings = {} }: PlaybackOptions,
): SongPlayback {
  const seconds = eventSeconds(events, rhythms, bpm).map(({ start, end }) => ({
    start: start / speed,
    end: end / speed,
  }));
  const beatStarts = events.map((event, index) => {
    if (event.kind !== 'tab') {
      return null;
    }
    const quarterSec = 60 / (event.tempo ?? bpm) / speed;
    const start = seconds[index]?.start ?? 0;
    return tabBeats(event.block).map((beat) => start + beat.start * quarterSec);
  });
  const voicing = (chord: string) => {
    const key = chordKey(chord);
    return (key ? voicings[key] : undefined) ?? voicingFor(chord, tuning.strings);
  };
  const notes = atSpeed(
    scheduleNotes(events, rhythms, {
      bpm,
      capo: soundCapo(capo, tuning),
      strings: tuning.strings,
      voicing,
    }),
    speed,
  );
  return { events, seconds, beatStarts, notes };
}

/** One bar of a pattern on one chord, to loop in the pattern editor. */
export function patternPlayback(rhythm: Rhythm, chord: string, options: PlaybackOptions) {
  const event: TimelineEvent = {
    kind: 'chord',
    chord,
    rhythm: rhythm.key,
    tempo: null,
    bar: 0,
    start: 0,
    length: 1,
    section: 0,
    line: 0,
    item: 0,
  };
  return {
    notes: schedule([event], [rhythm], options).notes,
    loopSec: (barBeats(rhythm.time) * 60) / options.bpm / (options.speed ?? 1),
  };
}

/** The whole song in time, for «Послушать». */
export function songPlayback(doc: SongDoc, rhythms: Rhythm[], options: PlaybackOptions) {
  return schedule(timeline(doc, rhythms), rhythms, options);
}

/** One section in time, for its play button. */
export function sectionPlayback(
  doc: SongDoc,
  rhythms: Rhythm[],
  section: number,
  options: PlaybackOptions,
) {
  return schedule(
    timeline(doc, rhythms).filter((event) => event.section === section),
    rhythms,
    options,
  );
}

/** One tab block on its own; `options.bpm` is the tempo around it, `\tempo` wins. */
export function tabPlayback(
  block: TabBlock,
  { bpm, capo, speed = 1, tuning = songTuning('standard') }: PlaybackOptions,
) {
  const tempo = block.tempo ?? bpm;
  const beats = tabBeats(block);
  return {
    notes: atSpeed(
      scheduleTab(block, { bpm: tempo, capo: soundCapo(capo, tuning), strings: tuning.strings }),
      speed,
    ),
    beats,
    beatStarts: beats.map((beat) => (beat.start * 60) / tempo / speed),
  };
}

export function beatAt(
  playback: { beats: TabBeatTime[]; beatStarts: number[] },
  position: number,
): ActiveBeat | null {
  const beat = playback.beats[playback.beatStarts.findLastIndex((start) => start <= position)];
  return beat ? { bar: beat.bar, beat: beat.beat } : null;
}

/** What sounds at `position` seconds: a chord item or a tab beat. */
export function playingAt(playback: SongPlayback, position: number): PlayingAt | null {
  const index = playback.seconds.findIndex((span) => position >= span.start && position < span.end);
  const event = playback.events[index];
  if (!event) {
    return null;
  }
  if (event.kind === 'chord') {
    return { section: event.section, line: event.line, item: event.item, beat: null };
  }
  const starts = playback.beatStarts[index] ?? [];
  const beat = tabBeats(event.block)[
    Math.max(
      0,
      starts.findLastIndex((start) => start <= position),
    )
  ];
  return {
    section: event.section,
    line: event.line,
    item: null,
    beat: beat ? { bar: beat.bar, beat: beat.beat } : null,
  };
}
