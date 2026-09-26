import { describe, expect, test } from 'bun:test';
import { chromaFromMagnitudes, detectChord, pitchClassNames } from './chords';
import { applyHannWindow, fftMagnitudes } from './fft';

const SAMPLE_RATE = 44100;
const FFT_SIZE = 8192;

function mixSines(frequencies: number[]): Float32Array {
  const samples = new Float32Array(FFT_SIZE);
  for (const frequency of frequencies) {
    for (let i = 0; i < FFT_SIZE; i++) {
      samples[i] += Math.sin((2 * Math.PI * frequency * i) / SAMPLE_RATE) / frequencies.length;
    }
  }
  return samples;
}

function chromaFor(frequencies: number[]) {
  const windowed = new Float32Array(FFT_SIZE);
  applyHannWindow(mixSines(frequencies), windowed);
  return chromaFromMagnitudes(fftMagnitudes(windowed), SAMPLE_RATE);
}

function topClasses(chroma: Float32Array, count: number) {
  return [...chroma]
    .map((value, index) => ({ name: pitchClassNames[index], value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((item) => item.name);
}

describe('chromaFromMagnitudes', () => {
  test('puts energy on C, E and G for a C major triad', () => {
    const chroma = chromaFor([130.81, 164.81, 196.0]);
    expect(topClasses(chroma, 3).sort()).toEqual(['C', 'E', 'G']);
  });

  test('puts energy on A, C and E for an A minor triad', () => {
    const chroma = chromaFor([110.0, 130.81, 164.81]);
    expect(topClasses(chroma, 3).sort()).toEqual(['A', 'C', 'E']);
  });
});

describe('detectChord', () => {
  test('labels a C major triad as C', () => {
    const result = detectChord(chromaFor([130.81, 164.81, 196.0, 261.63]));
    expect(result.chord?.label).toBe('C');
    expect(result.chord?.score).toBeGreaterThan(0.7);
  });

  test('labels an A minor triad as Am', () => {
    const result = detectChord(chromaFor([110.0, 130.81, 164.81, 220.0]));
    expect(result.chord?.label).toBe('Am');
  });

  test('labels G7 when the minor seventh is present', () => {
    const result = detectChord(chromaFor([98.0, 123.47, 146.83, 174.61]));
    expect(result.chord?.label).toBe('G7');
  });

  test('returns no chord for silence', () => {
    const result = detectChord(new Float32Array(12));
    expect(result.chord).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
