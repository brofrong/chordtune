import { describe, expect, test } from 'bun:test';

import {
  isRhythm,
  parsePickNotation,
  parseStrumNotation,
  type Rhythm,
  rhythmFromPreset,
  strumSymbols,
} from './rhythm';
import { RHYTHM_PRESETS } from './rhythm-presets';

const preset = (id: string) => RHYTHM_PRESETS.find((p) => p.id === id);

describe('presets', () => {
  test('match the table', () => {
    expect(RHYTHM_PRESETS.map((p) => p.id)).toEqual([
      'down-4',
      'four',
      'six',
      'six-muted',
      'eight',
      'waltz',
      'pick-four',
      'pick-eight',
      'pick-three',
      'pinch',
    ]);
    expect(strumSymbols(preset('six')!)).toEqual(['↓', '·', '↓', '↑', '·', '↑', '↓', '↑']);
    expect(strumSymbols(preset('six-muted')!)).toEqual(['↓', '·', 'x', '↑', '·', '↑', 'x', '↑']);
    expect(strumSymbols(preset('pinch')!)).toEqual(['Б', '123', "Б'", '123']);
    expect(preset('four')?.steps.map((s) => s?.accent ?? false)).toEqual([
      true,
      false,
      true,
      false,
    ]);
    expect(preset('waltz')?.time).toBe('3/4');
  });

  test('every preset is a valid rhythm', () => {
    for (const p of RHYTHM_PRESETS) {
      expect(isRhythm(rhythmFromPreset(p, 'A'))).toBe(true);
    }
  });

  test('rhythmFromPreset copies steps', () => {
    const rhythm = rhythmFromPreset(preset('six')!, 'B');
    expect(rhythm).toMatchObject({ key: 'B', name: 'Шестёрка', kind: 'strum', time: '4/4' });
    rhythm.steps[0] = null;
    expect(preset('six')?.steps[0]).not.toBeNull();
  });
});

describe('parseStrumNotation', () => {
  test('arrows matching a preset give the preset', () => {
    expect(parseStrumNotation('↓↓↑↑↓↑')?.name).toBe('Шестёрка');
    expect(parseStrumNotation('↓ ↓↑ ↑ ↓↓↓↑')?.name).toBe('Восьмёрка');
    expect(parseStrumNotation('↓↑↓↑')?.name).toBe('Четвёрка');
    expect(parseStrumNotation('шестёрка (↓↓↑↑↓↑ или с приглушкой ↓x↑↑x↑)')?.name).toBe('Шестёрка');
  });

  test('words give a preset', () => {
    expect(parseStrumNotation('шестерка')?.name).toBe('Шестёрка');
    expect(parseStrumNotation('бой восьмерка')?.name).toBe('Восьмёрка');
    expect(parseStrumNotation('Четвёрка')?.name).toBe('Четвёрка');
  });

  test('other arrows become steps in a row', () => {
    const rhythm = parseStrumNotation('↓ ↓ ⇣⇡↓↑↓ ↓↑⇣⇡');
    expect(rhythm).toMatchObject({ kind: 'strum', time: '4/4' });
    expect(strumSymbols(rhythm!)).toEqual(['↓', '↓', '⇣', '⇡', '↓', '↑', '↓', '↓', '↑', '⇣', '⇡']);
    expect(strumSymbols(parseStrumNotation('↓·×↑-↑')!)).toEqual(['↓', '·', 'x', '↑', '·', '↑']);
  });

  test('\\↓/ is an accented down stroke', () => {
    const rhythm = parseStrumNotation('↓↓\\↓/↓↑ ↓↓\\↓/↓↑');
    expect(rhythm?.steps.map((s) => s?.stroke)).toEqual([
      'D',
      'D',
      'D',
      'D',
      'U',
      'D',
      'D',
      'D',
      'D',
      'U',
    ]);
    expect(rhythm?.steps.map((s) => s?.accent ?? false)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      true,
      false,
      false,
    ]);
  });

  test('nothing to parse', () => {
    expect(parseStrumNotation('неизвестен')).toBeNull();
    expect(parseStrumNotation('')).toBeNull();
  });
});

describe('parsePickNotation', () => {
  test('preset patterns', () => {
    expect(parsePickNotation('Б-3-2-3-1-3-2-3')?.name).toBe('Перебор «восьмёрка»');
    expect(parsePickNotation('Б-3-2-3')?.name).toBe('Перебор «четвёрка»');
  });

  test('custom patterns', () => {
    expect(strumSymbols(parsePickNotation('б—3—2|1—3')!)).toEqual(['Б', '3', '2', '1', '3']);
    const pinch = parsePickNotation('куплет: б-3-12-3, припев: бой');
    expect(pinch?.steps).toEqual([
      { strings: ['B'] },
      { strings: [3] },
      { strings: [1, 2] },
      { strings: [3] },
    ]);
    expect(pinch).toMatchObject({ kind: 'pick', time: '4/4' });
  });

  test('nothing to parse', () => {
    expect(parsePickNotation('см. табы и ноты')).toBeNull();
  });
});

describe('isRhythm', () => {
  const valid: Rhythm = { key: 'A', name: 'x', kind: 'strum', time: '4/4', steps: [null] };

  test('accepts a valid rhythm', () => {
    expect(isRhythm(valid)).toBe(true);
  });

  test('rejects broken ones', () => {
    for (const broken of [
      null,
      { ...valid, key: 'a' },
      { ...valid, kind: 'tap' },
      { ...valid, time: '5/4' },
      { ...valid, steps: [] },
      { ...valid, steps: Array(33).fill(null) },
      { ...valid, steps: [{ stroke: 'Q' }] },
      { ...valid, steps: [{ strings: [7] }] },
      { ...valid, steps: [{ accent: 'yes' }] },
      { ...valid, name: 1 },
    ]) {
      expect(isRhythm(broken)).toBe(false);
    }
  });
});
