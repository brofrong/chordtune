import { describe, expect, test } from 'bun:test';
import {
  chordTones,
  GUITAR_TUNINGS,
  parseChord,
  playsChord,
  shapeMidis,
} from '@chordtune/chord-sheet';

import { OPEN_STRING_MIDI } from './guitar-synth';
import { barreOf, voicingCacheSize, voicingFor, voicingsFor } from './voicing';

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

const UKULELE = [67, 60, 64, 69];

const lowestFretted = (frets: readonly (number | null)[]) => {
  const fretted = frets.filter((fret): fret is number => fret !== null && fret > 0);
  return frets.includes(0) || fretted.length === 0 ? 0 : Math.min(...fretted);
};

describe('voicingsFor', () => {
  test('several distinct shapes in different places on the neck', () => {
    const shapes = voicingsFor('G');
    expect(shapes[0]?.frets).toEqual([3, 2, 0, 0, 0, 3]);
    expect(shapes.length).toBeGreaterThanOrEqual(4);
    expect(shapes.length).toBeLessThanOrEqual(8);
    expect(new Set(shapes.map((shape) => shape.frets.join())).size).toBe(shapes.length);
    expect(new Set(shapes.slice(0, 4).map((shape) => lowestFretted(shape.frets))).size).toBe(4);
  });

  test('limit', () => {
    expect(voicingsFor('C', undefined, { limit: 3 })).toHaveLength(3);
  });

  test('every shape plays the chord in other tunings', () => {
    for (const id of ['drop-d', 'open-g', 'dadgad'] as const) {
      const strings = GUITAR_TUNINGS[id];
      for (const raw of ['C', 'D', 'G', 'Am', 'Em']) {
        const shapes = voicingsFor(raw, strings);
        expect(shapes.length, `${raw} in ${id}`).toBeGreaterThan(0);
        for (const { frets } of shapes) {
          expect(playsChord(shapeMidis(frets, strings), raw), `${raw} ${frets} in ${id}`).toBe(
            true,
          );
        }
      }
    }
  });

  test('ukulele: re-entrant, the bass is not checked', () => {
    expect(voicingsFor('C', UKULELE)[0]?.frets).toEqual([0, 0, 0, 3]);
    expect(voicingsFor('Am', UKULELE)[0]?.frets).toEqual([2, 0, 0, 0]);
    expect(voicingsFor('F', UKULELE)[0]?.frets).toEqual([2, 0, 1, 0]);
  });

  test('voicingFor is the first shape', () => {
    expect(voicingFor('D', GUITAR_TUNINGS['drop-d'])).toEqual(
      voicingsFor('D', GUITAR_TUNINGS['drop-d'])[0]?.frets ?? null,
    );
    expect(voicingsFor('Xyz')).toEqual([]);
  });

  test('barre flag', () => {
    expect(voicingsFor('F')[0]?.barre).toBe(true);
    expect(voicingsFor('Am')[0]?.barre).toBe(false);
  });
});

describe('the voicing cache', () => {
  test('stays bounded however many distinct chords are looked up', () => {
    for (let i = 0; i < 600; i++) {
      voicingsFor(`Z${i}`);
    }
    expect(voicingCacheSize()).toBeLessThanOrEqual(512);
  });

  test('German and English spellings of the same chord share one entry', () => {
    voicingsFor('Hm');
    const after1 = voicingCacheSize();
    voicingsFor('Bm');
    expect(voicingCacheSize()).toBe(after1);
  });
});

describe('barreOf', () => {
  test('only when the shape needs more than four fingers', () => {
    expect(barreOf([1, 3, 3, 2, 1, 1])).toEqual({ fret: 1, from: 0, to: 5 });
    expect(barreOf([null, 1, 3, 3, 3, 1])).toEqual({ fret: 1, from: 1, to: 5 });
    expect(barreOf([null, null, 0, 2, 3, 2])).toBeNull();
    expect(barreOf([3, 2, 0, 0, 0, 3])).toBeNull();
  });
});
