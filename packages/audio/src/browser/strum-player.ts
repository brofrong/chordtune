import { synthesizePluck } from '../guitar-synth';
import { midiToHz } from '../pitch';
import type { ScheduledNote } from '../strum-schedule';
import { getAudioContext } from './audio-context';

const LOOKAHEAD_SEC = 0.2;
const SCHEDULE_EVERY_MS = 50;
const START_DELAY_SEC = 0.05;
/** A new hit on a string damps the previous one over roughly this time. */
const CHOKE_SEC = 0.015;
const MUTE_SEC = 0.04;
const RING_SEC = 2.5;
const CLICK_SEC = 0.03;
const CLICK_GAIN = 0.5;
const MASTER_GAIN = 0.8;

export type PlayOptions = {
  /** Repeat the notes every `loopSec` seconds until `stop()`. */
  loopSec?: number;
  /** Called every animation frame with the position in seconds (within the loop). */
  onTick?: (sec: number) => void;
};

export type StrumPlayer = {
  /** Resolves when playback ends or is stopped. A new call stops the previous one. */
  play(notes: readonly ScheduledNote[], options?: PlayOptions): Promise<void>;
  stop(): void;
};

const buffers = new Map<string, AudioBuffer>();

function pluckBuffer(context: AudioContext, midi: number): AudioBuffer {
  const key = `${context.sampleRate}:${midi}`;
  let buffer = buffers.get(key);
  if (!buffer) {
    const samples = synthesizePluck(midiToHz(midi), {
      sampleRate: context.sampleRate,
      durationSec: RING_SEC,
    });
    buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    buffers.set(key, buffer);
  }
  return buffer;
}

function clickBuffer(context: AudioContext): AudioBuffer {
  const key = `${context.sampleRate}:click`;
  let buffer = buffers.get(key);
  if (!buffer) {
    const length = Math.floor(context.sampleRate * CLICK_SEC);
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
    }
    buffer = context.createBuffer(1, length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    buffers.set(key, buffer);
  }
  return buffer;
}

/**
 * Plays scheduled string hits with look-ahead scheduling: every 50 ms the notes of the next
 * 200 ms are handed to the AudioContext, so timing does not depend on the main thread.
 */
export function createStrumPlayer(): StrumPlayer {
  let stopCurrent: (() => void) | null = null;

  return {
    async play(notes, options = {}) {
      stopCurrent?.();
      const context = await getAudioContext();
      if (!context || notes.length === 0) {
        return;
      }

      await new Promise<void>((resolve) => {
        const master = context.createGain();
        master.gain.value = MASTER_GAIN;
        master.connect(context.destination);

        const startTime = context.currentTime + START_DELAY_SEC;
        const endSec = (notes.at(-1)?.time ?? 0) + RING_SEC;
        const ringing = new Map<number, GainNode>();
        const sources = new Set<AudioBufferSourceNode>();
        let next = 0;
        let loopOffset = 0;

        const start = (buffer: AudioBuffer, destination: AudioNode, when: number) => {
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(destination);
          source.onended = () => sources.delete(source);
          source.start(when);
          sources.add(source);
        };

        const playNote = (note: ScheduledNote, when: number) => {
          ringing.get(note.string)?.gain.setTargetAtTime(0, when, CHOKE_SEC / 3);
          const gain = context.createGain();
          gain.gain.setValueAtTime(note.gain, when);
          if (note.muted) {
            gain.gain.linearRampToValueAtTime(0, when + MUTE_SEC);
          }
          gain.connect(master);
          start(pluckBuffer(context, note.midi), gain, when);
          ringing.set(note.string, gain);

          if (note.muted) {
            const click = context.createGain();
            click.gain.value = note.gain * CLICK_GAIN;
            click.connect(master);
            start(clickBuffer(context), click, when);
          }
        };

        const schedule = () => {
          const horizon = context.currentTime - startTime + LOOKAHEAD_SEC;
          for (;;) {
            if (next >= notes.length) {
              if (!options.loopSec) {
                break;
              }
              next = 0;
              loopOffset += options.loopSec;
            }
            const note = notes[next];
            if (note.time + loopOffset > horizon) {
              break;
            }
            playNote(note, startTime + loopOffset + note.time);
            next++;
          }
          if (
            !options.loopSec &&
            next >= notes.length &&
            context.currentTime - startTime > endSec
          ) {
            finish();
          }
        };

        let frame = 0;
        const tick = () => {
          const elapsed = Math.max(0, context.currentTime - startTime);
          options.onTick?.(options.loopSec ? elapsed % options.loopSec : elapsed);
          frame = requestAnimationFrame(tick);
        };

        const timer = setInterval(schedule, SCHEDULE_EVERY_MS);
        const finish = () => {
          clearInterval(timer);
          cancelAnimationFrame(frame);
          for (const source of sources) {
            source.stop();
          }
          master.disconnect();
          if (stopCurrent === finish) {
            stopCurrent = null;
          }
          resolve();
        };

        stopCurrent = finish;
        schedule();
        if (options.onTick) {
          frame = requestAnimationFrame(tick);
        }
      });
    },

    stop() {
      stopCurrent?.();
    },
  };
}
