import { describe, expect, test } from 'bun:test';

import { chordTones, parseChord } from './chord';
import { CHORD_SUFFIXES, NOTE_NAMES, nameChord, noteName, playsChord } from './chord-name';

const AM_OPEN = [45, 52, 57, 60, 64]; // x02210

describe('nameChord', () => {
  test('every root and quality names itself first in root position', () => {
    NOTE_NAMES.forEach((name, root) => {
      for (const suffix of CHORD_SUFFIXES) {
        const chord = parseChord(name + suffix);
        expect(chord, name + suffix).not.toBeNull();
        if (!chord) {
          continue;
        }
        const midis = chordTones(chord).intervals.map((interval) => 48 + root + interval);
        expect(nameChord(midis)[0], name + suffix).toBe(name + suffix);
      }
    });
  });

  test('alternatives: x02210 is Am, then C6/A among others', () => {
    const names = nameChord(AM_OPEN);
    expect(names[0]).toBe('Am');
    expect(names).toContain('C6/A');
  });

  test('a bass that is not the root makes a slash chord', () => {
    expect(nameChord([42, 50, 57, 62, 66])[0]).toBe('D/F#'); // 2x0232
  });

  test('ignoreBass: no slash chords for a re-entrant ukulele', () => {
    const am = [69, 60, 64, 69]; // GCEA 2000: the lowest note is the C string
    expect(nameChord(am)).toContain('Am/C');
    expect(nameChord(am)).not.toContain('Am');
    expect(nameChord(am, { ignoreBass: true })[0]).toBe('Am');
  });

  test('a fifth on its own is a power chord; one note or nothing known is empty', () => {
    expect(nameChord([40, 47])).toEqual(['E5']);
    expect(nameChord([40, 52])).toEqual([]);
    expect(nameChord([40, 41])).toEqual([]);
    expect(nameChord([])).toEqual([]);
  });
});

describe('playsChord', () => {
  test('all notes belong, all tones but an optional fifth are there, bass is right', () => {
    expect(playsChord(AM_OPEN, 'Am')).toBe(true);
    expect(playsChord(AM_OPEN, 'C')).toBe(false);
    expect(playsChord([45, 52, 57, 61, 64], 'Am')).toBe(false); // x02220 is A
    expect(playsChord([42, 50, 57, 62, 66], 'D/F#')).toBe(true);
    expect(playsChord([42, 50, 57, 62, 66], 'D')).toBe(false);
    expect(playsChord([47, 54, 59, 62, 66], 'Hm')).toBe(true);
    expect(playsChord([43, 47, 53, 59], 'G7')).toBe(true); // no fifth in a four-note chord
    expect(playsChord([69, 60, 64, 69], 'Am', { ignoreBass: true })).toBe(true);
    expect(playsChord([], 'Am')).toBe(false);
    expect(playsChord(AM_OPEN, 'Куплет')).toBe(false);
  });
});

describe('noteName', () => {
  test('pitch class names', () => {
    expect(noteName(40)).toBe('E');
    expect(noteName(58)).toBe('Bb');
    expect(noteName(61)).toBe('C#');
  });
});
