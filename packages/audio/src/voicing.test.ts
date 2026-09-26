import { describe, expect, test } from 'bun:test';
import { chordTones, parseChord } from '@chordtune/chord-sheet';

import { OPEN_STRING_MIDI } from './guitar-synth';
import { voicingFor } from './voicing';

const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const SUFFIXES = ['', 'm', '7', 'm7', 'maj7', 'sus4', 'dim', '6'];

function soundingPitchClasses(frets: readonly (number | null)[]): number[] {
  return frets.flatMap((fret, i) => (fret === null ? [] : [(OPEN_STRING_MIDI[i] + fret) % 12]));
}

function lowestPitchClass(frets: readonly (number | null)[]): number {
  const midis = frets.flatMap((fret, i) => (fret === null ? [] : [OPEN_STRING_MIDI[i] + fret]));
  return Math.min(...midis) % 12;
}

describe('voicingFor', () => {
  test('uses the catalog shape when there is one', () => {
    expect(voicingFor('Am')).toEqual([null, 0, 2, 2, 1, 0]);
    expect(voicingFor('Bb')).toEqual([null, 1, 3, 3, 3, 1]);
    expect(voicingFor('Hm')).toEqual([null, 2, 4, 4, 3, 2]);
  });

  test('finds a playable shape for every root and common quality', () => {
    for (const root of ROOTS) {
      for (const suffix of SUFFIXES) {
        const raw = root + suffix;
        const frets = voicingFor(raw);
        expect(frets, raw).not.toBeNull();
        if (!frets) {
          continue;
        }
        const tones = chordTones(parseChord(raw)!);
        const pcs = new Set(soundingPitchClasses(frets));
        const fifth = (tones.root + 7) % 12;
        for (const interval of tones.intervals) {
          const pc = (tones.root + interval) % 12;
          if (!(tones.intervals.length >= 4 && pc === fifth)) {
            expect(pcs.has(pc), `${raw} misses ${pc}`).toBe(true);
          }
        }
        const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
        if (fretted.length > 0) {
          expect(Math.max(...fretted) - Math.min(...fretted), raw).toBeLessThanOrEqual(3);
        }
        expect(frets.filter((fret) => fret !== null).length, raw).toBeGreaterThanOrEqual(4);
      }
    }
  });

  test('slash chords put the bass lowest', () => {
    const frets = voicingFor('D/F#');
    expect(frets).not.toBeNull();
    expect(lowestPitchClass(frets!)).toBe(6);
    expect(lowestPitchClass(voicingFor('C/G')!)).toBe(7);
  });

  test('searched shapes keep the root lowest', () => {
    for (const raw of ['Cdim', 'F#7', 'Ebmaj7', 'Gsus4', 'Ab6']) {
      expect(lowestPitchClass(voicingFor(raw)!), raw).toBe(chordTones(parseChord(raw)!).root);
    }
  });

  test('not a chord', () => {
    expect(voicingFor('Xyz')).toBeNull();
  });
});
