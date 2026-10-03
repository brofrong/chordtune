import { describe, expect, test } from 'bun:test';

import { SONG_TUNING_IDS } from '@chordtune/chord-sheet';

import { midiToHz } from './pitch';
import {
  analysisWindowSize,
  findTuning,
  INSTRUMENTS,
  nearestString,
  stringLabel,
  stringTarget,
} from './tunings';

describe('tunings', () => {
  test('standard guitar reads E A D G B E', () => {
    const labels = findTuning('guitar', 'standard').strings.map(stringLabel);
    expect(labels).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
  });

  test('ukulele standard is re-entrant G C E A', () => {
    const labels = findTuning('ukulele', 'standard').strings.map(stringLabel);
    expect(labels).toEqual(['G4', 'C4', 'E4', 'A4']);
  });

  test('every string sits inside its instrument range', () => {
    for (const instrument of INSTRUMENTS) {
      for (const tuning of instrument.tunings) {
        for (const midi of tuning.strings) {
          const hz = midiToHz(midi);
          expect(hz).toBeGreaterThan(instrument.minHz);
          expect(hz).toBeLessThan(instrument.maxHz);
        }
      }
    }
  });

  test('unknown tuning falls back to the first one', () => {
    expect(findTuning('guitar', 'nope').id).toBe('standard');
  });

  test('nearestString picks the closest string and signs the cents', () => {
    const strings = findTuning('guitar', 'standard').strings;
    const flatA = midiToHz(45) * 2 ** (-12 / 1200);
    const match = nearestString(flatA, strings);
    expect(match?.index).toBe(1);
    expect(match?.cents).toBeCloseTo(-12, 3);
  });

  test('nearestString follows the A4 calibration', () => {
    const strings = findTuning('guitar', 'standard').strings;
    const match = nearestString(midiToHz(45, 432), strings, 432);
    expect(match?.cents).toBeCloseTo(0, 3);
  });

  test('stringTarget measures against a locked string even when far away', () => {
    const strings = findTuning('guitar', 'drop-d').strings;
    const target = stringTarget(midiToHz(40), strings, 0);
    expect(target?.cents).toBeCloseTo(200, 3);
  });

  test('analysisWindowSize holds two periods of the lowest note', () => {
    expect(analysisWindowSize(48000, 60)).toBe(2048);
    expect(analysisWindowSize(48000, 28)).toBe(4096);
    expect(analysisWindowSize(96000, 28)).toBe(8192);
  });

  test('guitar tunings are the song tunings', () => {
    const guitar = INSTRUMENTS.find((instrument) => instrument.id === 'guitar');
    expect(guitar?.tunings.map((tuning) => tuning.id)).toEqual(SONG_TUNING_IDS);
    expect(guitar?.tunings[0]?.strings).toEqual([40, 45, 50, 55, 59, 64]);
  });
});
