import { describe, expect, test } from 'bun:test';

import { GUITAR_TUNINGS, isReentrant, isSongTuningId, SONG_TUNING_IDS, songTuning } from './tuning';

describe('songTuning', () => {
  test('tuned-down tunings play the shapes of another, lower', () => {
    expect(songTuning('half-step-down')).toEqual({
      id: 'half-step-down',
      strings: GUITAR_TUNINGS.standard,
      shift: -1,
    });
    expect(songTuning('d-standard')).toMatchObject({ strings: GUITAR_TUNINGS.standard, shift: -2 });
    expect(songTuning('drop-c')).toMatchObject({ strings: GUITAR_TUNINGS['drop-d'], shift: -2 });
  });

  test('other tunings play their own strings', () => {
    expect(songTuning('open-g')).toEqual({
      id: 'open-g',
      strings: GUITAR_TUNINGS['open-g'],
      shift: 0,
    });
    expect(songTuning('standard').shift).toBe(0);
  });

  test('strings plus shift are the real open strings', () => {
    for (const id of SONG_TUNING_IDS) {
      const { strings, shift } = songTuning(id);
      expect(
        strings.map((midi) => midi + shift),
        id,
      ).toEqual([...GUITAR_TUNINGS[id]]);
    }
  });

  test('unknown or missing ids are standard', () => {
    expect(songTuning('banjo').id).toBe('standard');
    expect(songTuning(null).id).toBe('standard');
    expect(songTuning(undefined).id).toBe('standard');
    expect(isSongTuningId('dadgad')).toBe(true);
    expect(isSongTuningId('toString')).toBe(false);
  });
});

describe('isReentrant', () => {
  test('a string lower than the one before it', () => {
    expect(isReentrant([67, 60, 64, 69])).toBe(true);
    expect(isReentrant([55, 60, 64, 69])).toBe(false);
    expect(isReentrant(GUITAR_TUNINGS.standard)).toBe(false);
  });
});
