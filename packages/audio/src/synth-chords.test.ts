import { describe, expect, test } from 'bun:test';

import { chromaFromMagnitudes, detectChord } from './chords';
import { applyHannWindow, fftMagnitudes } from './fft';
import { CHORD_CATALOG, type ChordVariant, synthesizeChord } from './guitar-synth';

const FFT_SIZE = 8192;
const ANALYZE_AT_SEC = 0.28;

const TAKES: {
  variant: ChordVariant;
  seed: number;
  strumMs: number;
  detuneCents: number;
}[] = [
  { variant: 'clean', seed: 11, strumMs: 3.6, detuneCents: 0 },
  { variant: 'clean', seed: 29, strumMs: 6.4, detuneCents: 1.5 },
  { variant: 'noise', seed: 47, strumMs: 5.0, detuneCents: 0.8 },
];

function detectLabel(samples: Float32Array, sampleRate: number) {
  const from = Math.floor(ANALYZE_AT_SEC * sampleRate);
  const windowed = new Float32Array(FFT_SIZE);
  applyHannWindow(samples.subarray(from, from + FFT_SIZE), windowed);
  const result = detectChord(chromaFromMagnitudes(fftMagnitudes(windowed), sampleRate));
  return {
    label: result.chord?.label ?? null,
    candidates: result.candidates.map((item) => item.label),
  };
}

function isAmbiguous(label: string): boolean {
  return /^[A-G]#?m$/.test(label) || label.endsWith('m7');
}

describe('synthesized guitar chords', () => {
  for (const spec of CHORD_CATALOG) {
    for (const take of TAKES) {
      const ambiguous = isAmbiguous(spec.label);
      const name = `${spec.label} ${take.variant} seed ${take.seed}`;

      test(`${name} ${ambiguous ? 'ranks the chord in the top 3' : 'detects the chord'}`, () => {
        const { samples, sampleRate } = synthesizeChord(spec, take);
        const result = detectLabel(samples, sampleRate);
        expect(result.candidates).toContain(spec.label);
        if (!ambiguous && take.variant === 'clean') {
          expect(result.label).toBe(spec.label);
        }
      });
    }
  }
});
