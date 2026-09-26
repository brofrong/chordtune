import { describe, expect, test } from 'bun:test';

import { chromaFromMagnitudes, detectChord, pitchClassNames } from './chords';
import { applyHannWindow, fftMagnitudes } from './fft';
import { CHORD_CATALOG, synthesizeChord, synthesizeNote, voicingToMidi } from './guitar-synth';
import { centsBetween, detectPitchYin, midiToHz } from './pitch';

function pitchClassFromMidi(midi: number): string {
  return pitchClassNames[((Math.round(midi) % 12) + 12) % 12];
}

describe('chord catalog voicings', () => {
  test('every shape has at least three sounding strings', () => {
    for (const spec of CHORD_CATALOG) {
      expect(voicingToMidi(spec.frets).length).toBeGreaterThanOrEqual(3);
    }
  });

  test('open Am is A C E', () => {
    const am = CHORD_CATALOG.find((spec) => spec.label === 'Am');
    expect(am).toBeDefined();
    const notes = new Set(voicingToMidi(am!.frets).map(pitchClassFromMidi));
    expect(notes).toEqual(new Set(['A', 'C', 'E']));
  });

  test('open E is E G# B', () => {
    const e = CHORD_CATALOG.find((spec) => spec.label === 'E');
    expect(e).toBeDefined();
    const notes = new Set(voicingToMidi(e!.frets).map(pitchClassFromMidi));
    expect(notes).toEqual(new Set(['E', 'G#', 'B']));
  });

  test('B7 contains the minor seventh A', () => {
    const b7 = CHORD_CATALOG.find((spec) => spec.label === 'B7');
    expect(b7).toBeDefined();
    const notes = new Set(voicingToMidi(b7!.frets).map(pitchClassFromMidi));
    expect(notes.has('B')).toBe(true);
    expect(notes.has('D#')).toBe(true);
    expect(notes.has('A')).toBe(true);
  });
});

describe('midiToHz', () => {
  test('A4 is 440', () => {
    expect(midiToHz(69)).toBeCloseTo(440, 6);
  });
});

describe('synthesizeChord', () => {
  test('open A and B7 detect as themselves', () => {
    for (const label of ['A', 'B7', 'C', 'E7'] as const) {
      const spec = CHORD_CATALOG.find((item) => item.label === label);
      expect(spec).toBeDefined();
      const { samples, sampleRate } = synthesizeChord(spec!, { seed: 11, variant: 'clean' });
      const from = Math.floor(0.28 * sampleRate);
      const windowed = new Float32Array(8192);
      applyHannWindow(samples.subarray(from, from + 8192), windowed);
      const result = detectChord(chromaFromMagnitudes(fftMagnitudes(windowed), sampleRate));
      expect(result.chord?.label).toBe(label);
    }
  });
});

describe('synthesizeNote', () => {
  test('reference tones land within a cent of the target at 48 kHz', () => {
    const sampleRate = 48000;
    for (const midi of [28, 40, 45, 55, 64, 69]) {
      const target = midiToHz(midi);
      const samples = synthesizeNote(target, { sampleRate });
      const from = Math.floor(0.3 * sampleRate);
      const pitch = detectPitchYin(samples.subarray(from, from + 4096), sampleRate, {
        minHz: 28,
      });
      expect(pitch.frequency).not.toBeNull();
      expect(Math.abs(centsBetween(pitch.frequency ?? 0, target))).toBeLessThan(1);
    }
  });
});
