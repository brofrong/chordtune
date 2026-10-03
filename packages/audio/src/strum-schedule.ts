import {
  barBeats,
  type ChordEvent,
  type Rhythm,
  type Step,
  type StringRef,
  type TimelineEvent,
  tabQuarters,
} from '@chordtune/chord-sheet';

import { type GuitarFrets, OPEN_STRING_MIDI } from './guitar-synth';
import { scheduleTab } from './tab-schedule';
import { voicingFor } from './voicing';

export type ScheduledNote = {
  /** Seconds from the start of the first event. */
  time: number;
  midi: number;
  /** 1 = high E … 6 = low E. */
  string: number;
  gain: number;
  muted: boolean;
};

export type ScheduleOptions = {
  bpm: number;
  /** Frets the capo raises every note by. */
  capo?: number;
  /** Open strings as MIDI notes, thickest first; standard tuning when missing. */
  strings?: readonly number[];
  voicing?: (chord: string) => GuitarFrets | null;
};

const STRUM_SPREAD_SEC = 0.01;
const UP_STRINGS = 4;
const UP_GAIN = 0.8;
const PICK_GAIN = 0.9;
const ACCENT_GAIN = 1.3;
const EPSILON = 1e-9;

const BEAT_STRUM: Rhythm = {
  key: '',
  name: '',
  kind: 'strum',
  time: '4/4',
  steps: [{ stroke: 'D' }, { stroke: 'D' }, { stroke: 'D' }, { stroke: 'D' }],
};

function rhythmOf(event: ChordEvent, rhythms: readonly Rhythm[]): Rhythm {
  return rhythms.find((rhythm) => rhythm.key === event.rhythm) ?? BEAT_STRUM;
}

function barSeconds(rhythm: Rhythm, bpm: number): number {
  return (barBeats(rhythm.time) * 60) / bpm;
}

function eventLength(event: TimelineEvent, rhythms: readonly Rhythm[], bpm: number): number {
  const tempo = event.tempo ?? bpm;
  return event.kind === 'tab'
    ? (tabQuarters(event.block) * 60) / tempo
    : event.length * barSeconds(rhythmOf(event, rhythms), tempo);
}

/** Start and end of each event in seconds; events play back to back from 0. */
export function eventSeconds(
  events: readonly TimelineEvent[],
  rhythms: readonly Rhythm[],
  bpm: number,
): { start: number; end: number }[] {
  let cursor = 0;
  return events.map((event) => {
    const start = cursor;
    cursor += eventLength(event, rhythms, bpm);
    return { start, end: cursor };
  });
}

/** Turns chord events and rhythm patterns into individual string hits. */
export function scheduleNotes(
  events: readonly TimelineEvent[],
  rhythms: readonly Rhythm[],
  options: ScheduleOptions,
): ScheduledNote[] {
  const strings = options.strings ?? OPEN_STRING_MIDI;
  const voicing = options.voicing ?? ((chord: string) => voicingFor(chord, strings));
  const capo = options.capo ?? 0;
  const seconds = eventSeconds(events, rhythms, options.bpm);
  const notes: ScheduledNote[] = [];

  events.forEach((event, index) => {
    const offset = seconds[index]?.start ?? 0;
    if (event.kind === 'tab') {
      for (const note of scheduleTab(event.block, {
        bpm: event.tempo ?? options.bpm,
        capo,
        strings,
      })) {
        notes.push({ ...note, time: note.time + offset });
      }
      return;
    }
    const frets = voicing(event.chord);
    if (!frets) {
      return;
    }
    const rhythm = rhythmOf(event, rhythms);
    const barSec = barSeconds(rhythm, event.tempo ?? options.bpm);
    const end = event.start + event.length;
    const stepCount = rhythm.steps.length;

    for (let bar = Math.floor(event.start + EPSILON); bar < end - EPSILON; bar++) {
      rhythm.steps.forEach((step, i) => {
        const at = bar + i / stepCount;
        if (step && at >= event.start - EPSILON && at < end - EPSILON) {
          const time = offset + (at - event.start) * barSec;
          notes.push(...playStep(step, rhythm.kind, frets, time, capo, strings));
        }
      });
    }
  });

  return notes.sort((a, b) => a.time - b.time);
}

const SHAPE_SPREAD_SEC = 0.03;

/** One slow down strum of a shape, for trying a chord out. */
export function strumShape(
  frets: GuitarFrets,
  strings: readonly number[] = OPEN_STRING_MIDI,
  capo = 0,
): ScheduledNote[] {
  const notes: ScheduledNote[] = [];
  frets.forEach((fret, index) => {
    if (fret !== null) {
      notes.push(
        note(index, fret, notes.length * SHAPE_SPREAD_SEC, PICK_GAIN, false, capo, strings),
      );
    }
  });
  return notes;
}

function note(
  index: number,
  fret: number,
  time: number,
  gain: number,
  muted: boolean,
  capo: number,
  strings: readonly number[],
) {
  return {
    time,
    midi: (strings[index] ?? strings[0]) + fret + capo,
    string: strings.length - index,
    gain,
    muted,
  };
}

function playStep(
  step: NonNullable<Step>,
  kind: Rhythm['kind'],
  frets: GuitarFrets,
  time: number,
  capo: number,
  strings: readonly number[],
): ScheduledNote[] {
  const accent = step.accent ? ACCENT_GAIN : 1;
  // Indices into `frets`, low E first.
  const sounding = frets.flatMap((fret, index) => (fret === null ? [] : [index]));

  if (kind === 'pick') {
    return (step.strings ?? []).flatMap((ref) => {
      const index = pickedString(ref, frets, sounding, strings);
      return index === null
        ? []
        : [note(index, frets[index] ?? 0, time, PICK_GAIN * accent, false, capo, strings)];
    });
  }

  const strum = (indices: number[], gain: number, muted: boolean) =>
    indices.map((index, order) =>
      note(
        index,
        frets[index] ?? 0,
        time + order * STRUM_SPREAD_SEC,
        gain * accent,
        muted,
        capo,
        strings,
      ),
    );

  switch (step.stroke) {
    case 'D':
    case 'd':
      return strum(sounding, 1, step.stroke === 'd');
    case 'U':
    case 'u':
      return strum(sounding.slice(-UP_STRINGS).reverse(), UP_GAIN, step.stroke === 'u');
    case 'x':
      return strum(
        strings.map((_, index) => index),
        1,
        true,
      );
    default:
      return [];
  }
}

/** `B` is the lowest sounding string, `B'` the next one up with a different note. */
function pickedString(
  ref: StringRef,
  frets: GuitarFrets,
  sounding: number[],
  strings: readonly number[],
): number | null {
  const bass = sounding[0];
  if (bass === undefined) {
    return null;
  }
  if (ref === 'B') {
    return bass;
  }
  if (ref === "B'") {
    const bassPc = (strings[bass] + (frets[bass] ?? 0)) % 12;
    return (
      sounding.find(
        (index) => index > bass && (strings[index] + (frets[index] ?? 0)) % 12 !== bassPc,
      ) ?? bass
    );
  }
  const index = strings.length - ref;
  return frets[index] === null || frets[index] === undefined ? null : index;
}
