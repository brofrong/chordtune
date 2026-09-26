import { describe, expect, test } from 'bun:test';

import {
  alignOctave,
  createPitchTracker,
  detectPitchYin,
  frequencyToNote,
  rms,
  trackPitch,
} from './pitch';

function sineWave(
  frequency: number,
  sampleRate: number,
  length: number,
  amplitude = 1,
): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}

describe('frequencyToNote', () => {
  test('maps A4 440 Hz to A in octave 4 with 0 cents', () => {
    const note = frequencyToNote(440);
    expect(note.name).toBe('A');
    expect(note.octave).toBe(4);
    expect(note.midi).toBe(69);
    expect(Math.abs(note.cents)).toBeLessThan(0.5);
  });

  test('maps guitar low E (~82.41 Hz) to E2', () => {
    const note = frequencyToNote(82.4069);
    expect(note.name).toBe('E');
    expect(note.octave).toBe(2);
    expect(Math.abs(note.cents)).toBeLessThan(1);
  });

  test('reports cents sharp of the nearest note', () => {
    const slightlySharpA = 440 * 2 ** (10 / 1200);
    const note = frequencyToNote(slightlySharpA);
    expect(note.name).toBe('A');
    expect(note.cents).toBeGreaterThan(9);
    expect(note.cents).toBeLessThan(11);
  });
});

describe('detectPitchYin', () => {
  const sampleRate = 44100;

  test('detects a 440 Hz sine within 1 Hz', () => {
    const result = detectPitchYin(sineWave(440, sampleRate, 2048), sampleRate);
    expect(result.frequency).not.toBeNull();
    expect(Math.abs((result.frequency ?? 0) - 440)).toBeLessThan(1);
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  test('detects guitar A2 (110 Hz)', () => {
    const result = detectPitchYin(sineWave(110, sampleRate, 2048), sampleRate);
    expect(result.frequency).not.toBeNull();
    expect(Math.abs((result.frequency ?? 0) - 110)).toBeLessThan(1);
  });

  test('returns no pitch for silence', () => {
    const result = detectPitchYin(new Float32Array(2048), sampleRate);
    expect(result.frequency).toBeNull();
  });

  test('detects a quiet 440 Hz sine that sits below the old 0.01 rms gate', () => {
    const samples = sineWave(440, sampleRate, 2048, 0.007);
    expect(rms(samples)).toBeLessThan(0.01);
    const result = detectPitchYin(samples, sampleRate);
    expect(result.frequency).not.toBeNull();
    expect(Math.abs((result.frequency ?? 0) - 440)).toBeLessThan(1);
  });
});

describe('rms', () => {
  test('is ~0.707 for a full-scale sine', () => {
    const value = rms(sineWave(440, 44100, 2048));
    expect(value).toBeGreaterThan(0.7);
    expect(value).toBeLessThan(0.72);
  });
});

describe('alignOctave', () => {
  test('folds an octave error back to the reference note', () => {
    expect(alignOctave(164.81, 82.41)).toBeCloseTo(82.41, 1);
    expect(alignOctave(82.41, 164.81)).toBeCloseTo(164.81, 1);
  });

  test('leaves a different string alone', () => {
    expect(alignOctave(110, 82.41)).toBeCloseTo(110, 1);
  });
});

describe('trackPitch', () => {
  test('holds the locked octave through a short run of doubled detections', () => {
    const state = createPitchTracker();
    expect(trackPitch(196, state)).toBeCloseTo(196, 1);
    for (let i = 0; i < 8; i++) {
      expect(trackPitch(392, state)).toBeCloseTo(196, 1);
    }
    expect(trackPitch(196, state)).toBeCloseTo(196, 1);
  });

  test('drops a shaky sub-octave lock once a clearly more confident octave shows up', () => {
    const state = createPitchTracker();
    expect(trackPitch(61.7, state, 16, 0.7)).toBeCloseTo(61.7, 1);
    expect(trackPitch(246.9, state, 16, 0.74)).toBeCloseTo(61.7, 1);
    expect(trackPitch(246.9, state, 16, 0.9)).toBeCloseTo(246.9, 1);
  });

  test('keeps a confident lock even when the other octave scores higher', () => {
    const state = createPitchTracker();
    expect(trackPitch(196, state, 16, 0.9)).toBeCloseTo(196, 1);
    expect(trackPitch(98, state, 16, 1)).toBeCloseTo(196, 1);
  });
});
