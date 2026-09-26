import { describe, expect, test } from 'bun:test';

import { DEFAULT_ANALYZER_SETTINGS, TunerAnalyzer, type TunerFrame } from './analyzer';
import { midiToHz } from './pitch';
import { listNoteFixtures, noteFromFilename, readNoteFixture, sineWave } from './test-utils/wav';
import { findTuning, getInstrument, nearestString } from './tunings';

const CHUNK = 512;

function feed(analyzer: TunerAnalyzer, samples: Float32Array): TunerFrame[] {
  const frames: TunerFrame[] = [];
  for (let i = 0; i < samples.length; i += CHUNK) {
    frames.push(...analyzer.push(samples.subarray(i, i + CHUNK)));
  }
  return frames;
}

describe('TunerAnalyzer', () => {
  test('emits one frame per hop once the window is full', () => {
    const analyzer = new TunerAnalyzer(48000);
    const frames = feed(analyzer, sineWave(440, 48000, analyzer.windowSize * 3));
    // first frame lands when the ring fills, then one per hop
    expect(frames.length).toBe(5);
  });

  test('tracks a continuous 440 Hz sine fed in worklet-sized chunks', () => {
    const analyzer = new TunerAnalyzer(48000);
    const frames = feed(analyzer, sineWave(440, 48000, 48000));
    const voiced = frames.filter((frame) => frame.frequency != null);
    expect(voiced.length).toBe(frames.length);
    for (const frame of voiced) {
      expect(frame.note?.name).toBe('A');
      expect(Math.abs(frame.note?.cents ?? 99)).toBeLessThan(1);
    }
  });

  test('reports cents against a calibrated A4', () => {
    const analyzer = new TunerAnalyzer(48000, { ...DEFAULT_ANALYZER_SETTINGS, a4: 432 });
    const frames = feed(analyzer, sineWave(432, 48000, 24000));
    const last = frames.at(-1);
    expect(last?.note?.name).toBe('A');
    expect(Math.abs(last?.note?.cents ?? 99)).toBeLessThan(1);
  });

  test('grows the window for bass so low B still resolves', () => {
    const bass = getInstrument('bass');
    const analyzer = new TunerAnalyzer(48000, {
      ...DEFAULT_ANALYZER_SETTINGS,
      minHz: bass.minHz,
      maxHz: bass.maxHz,
    });
    expect(analyzer.windowSize).toBe(4096);
    const lowB = midiToHz(23);
    const frames = feed(analyzer, sineWave(lowB, 48000, 48000));
    const last = frames.at(-1);
    expect(`${last?.note?.name}${last?.note?.octave}`).toBe('B0');
  });

  test('includes debug data only when asked', () => {
    const plain = new TunerAnalyzer(48000);
    expect(feed(plain, sineWave(220, 48000, 8192)).at(-1)?.debug).toBeNull();

    const debug = new TunerAnalyzer(48000, { ...DEFAULT_ANALYZER_SETTINGS, debug: true });
    const frame = feed(debug, sineWave(220, 48000, 8192)).at(-1);
    expect(frame?.debug?.spectrum.length).toBeGreaterThan(0);
    expect(frame?.debug?.waveform.length).toBeGreaterThan(0);
  });

  const standard = findTuning('guitar', 'standard');
  for (const file of listNoteFixtures()) {
    const expected = noteFromFilename(file);

    test(`${file}: nearest standard string is ${expected} while it rings`, async () => {
      const { sampleRate, samples } = await readNoteFixture(file);
      const analyzer = new TunerAnalyzer(sampleRate);
      const voiced = feed(analyzer, samples).filter((frame) => frame.frequency != null);
      expect(voiced.length).toBeGreaterThan(20);

      const matches = voiced.filter((frame) => {
        const match = nearestString(frame.frequency as number, standard.strings);
        const label = `${frame.note?.name}${frame.note?.octave}`;
        return match != null && label === expected && Math.abs(match.cents) < 50;
      });
      expect(matches.length / voiced.length).toBeGreaterThan(0.9);
    });
  }
});
