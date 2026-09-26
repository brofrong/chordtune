import { describe, expect, test } from 'bun:test';

import { createPitchTracker, detectPitchYin, frequencyToNote, rms, trackPitch } from './pitch';
import { listNoteFixtures, noteFromFilename, readNoteFixture } from './test-utils/wav';

const WINDOW = 2048;
const HOP = 512;
const ATTACK_SKIP_SEC = 0.08;
const MIN_RMS = 0.0018;

function scanClip(samples: Float32Array, sampleRate: number) {
  const frames: { t: number; note: string | null; rms: number }[] = [];
  const tracker = createPitchTracker();
  for (let i = 0; i + WINDOW <= samples.length; i += HOP) {
    const window = samples.subarray(i, i + WINDOW);
    const level = rms(window);
    const pitch = detectPitchYin(window, sampleRate);
    const frequency = trackPitch(pitch.frequency, tracker);
    const match = frequency ? frequencyToNote(frequency) : null;
    frames.push({
      t: i / sampleRate,
      note: match ? `${match.name}${match.octave}` : null,
      rms: level,
    });
  }
  return frames;
}

describe('recorded guitar notes', () => {
  const files = listNoteFixtures();

  test('has the six open-string recordings', () => {
    const labels = new Set(files.map(noteFromFilename));
    expect(labels).toEqual(new Set(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']));
  });

  test('low E sustain is E2, not the octave above', async () => {
    const file = files.find((name) => name.startsWith('E2_'));
    expect(file).toBeDefined();
    const { sampleRate, samples } = await readNoteFixture(file as string);
    for (const at of [0.7, 3.1]) {
      const from = Math.floor(at * sampleRate);
      const pitch = detectPitchYin(samples.subarray(from, from + WINDOW), sampleRate);
      expect(pitch.frequency).not.toBeNull();
      const note = frequencyToNote(pitch.frequency ?? 0);
      expect(`${note.name}${note.octave}`).toBe('E2');
      expect(Math.abs((pitch.frequency ?? 0) - 82.41)).toBeLessThan(3);
    }
  });

  for (const file of files) {
    const expected = noteFromFilename(file);

    test(`${file} stays ${expected} for almost all of the ringing`, async () => {
      const { sampleRate, samples } = await readNoteFixture(file);
      const frames = scanClip(samples, sampleRate);
      const onset = frames.find((frame) => frame.rms >= MIN_RMS)?.t;
      expect(onset).toBeDefined();
      const start = onset as number;

      let ringingEnd = start;
      let lastVoiced = start;
      for (const frame of frames) {
        if (frame.t < start) {
          continue;
        }
        if (frame.rms >= MIN_RMS) {
          if (frame.t - lastVoiced > 0.25) {
            break;
          }
          lastVoiced = frame.t;
          ringingEnd = frame.t;
        }
      }

      const sustain = frames.filter(
        (frame) =>
          frame.t >= start + ATTACK_SKIP_SEC && frame.t <= ringingEnd && frame.rms >= MIN_RMS,
      );
      const correct = sustain.filter((frame) => frame.note === expected);

      expect(ringingEnd - start).toBeGreaterThan(1.2);
      expect(correct.length / sustain.length).toBeGreaterThan(0.9);
    });
  }
});
