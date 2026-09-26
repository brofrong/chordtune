import { describe, expect, test } from 'bun:test';

import {
  ANALYSIS_MAX_GAIN,
  ANALYSIS_TARGET_PEAK,
  analysisGain,
  applyGain,
  peakAmplitude,
} from './pcm';

describe('applyGain', () => {
  test('leaves samples unchanged at gain 1', () => {
    const samples = Float32Array.from([0.1, -0.2, 0.5]);
    const out = applyGain(samples, 1);
    expect(out[0]).toBeCloseTo(0.1);
    expect(out[1]).toBeCloseTo(-0.2);
    expect(out[2]).toBeCloseTo(0.5);
  });

  test('multiplies amplitude by the gain', () => {
    const samples = Float32Array.from([0.1, -0.2, 0.25]);
    const out = applyGain(samples, 2);
    expect(out[0]).toBeCloseTo(0.2);
    expect(out[1]).toBeCloseTo(-0.4);
    expect(out[2]).toBeCloseTo(0.5);
  });

  test('clips values that would exceed 1 or -1', () => {
    const samples = Float32Array.from([0.6, -0.8, 0]);
    expect(Array.from(applyGain(samples, 4))).toEqual([1, -1, 0]);
  });

  test('writes into the provided output buffer without mutating input', () => {
    const samples = Float32Array.from([0.25, -0.25]);
    const out = new Float32Array(2);
    applyGain(samples, 2, out);
    expect(samples[0]).toBeCloseTo(0.25);
    expect(samples[1]).toBeCloseTo(-0.25);
    expect(out[0]).toBeCloseTo(0.5);
    expect(out[1]).toBeCloseTo(-0.5);
  });
});

describe('peakAmplitude', () => {
  test('returns the largest absolute sample', () => {
    expect(peakAmplitude(Float32Array.from([0.1, -0.4, 0.2]))).toBeCloseTo(0.4);
  });
});

describe('analysisGain', () => {
  test('does not boost silence or noise below the gate', () => {
    expect(analysisGain(0)).toBe(1);
    expect(analysisGain(0.0001)).toBe(1);
  });

  test('scales a quiet peak up to the target level', () => {
    expect(analysisGain(0.07)).toBeCloseTo(ANALYSIS_TARGET_PEAK / 0.07);
  });

  test('turns a loud peak down toward the target', () => {
    expect(analysisGain(1)).toBeCloseTo(ANALYSIS_TARGET_PEAK);
  });

  test('caps extreme boost so hiss cannot explode', () => {
    expect(analysisGain(0.001)).toBe(ANALYSIS_MAX_GAIN);
  });

  test('multiplies auto gain by the extra user gain until the cap', () => {
    expect(analysisGain(0.07, 2)).toBeCloseTo((ANALYSIS_TARGET_PEAK / 0.07) * 2);
  });
});

describe('normalize for analysis', () => {
  test('quiet samples reach the target peak after auto gain', () => {
    const samples = Float32Array.from([0.05, -0.1, 0.02]);
    const out = applyGain(samples, analysisGain(peakAmplitude(samples)));
    expect(peakAmplitude(out)).toBeCloseTo(ANALYSIS_TARGET_PEAK);
  });
});
