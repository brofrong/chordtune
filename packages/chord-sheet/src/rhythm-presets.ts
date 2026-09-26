import type { RhythmDraft, Step, StringRef, Stroke } from './rhythm';

export type RhythmPreset = RhythmDraft & { id: string };

/** `'D - D U'` → strum steps; `>` before a stroke marks an accent. */
function strum(pattern: string): Step[] {
  return pattern.split(' ').map((token) => {
    if (token === '-') {
      return null;
    }
    const accent = token.startsWith('>');
    const stroke = token.replace('>', '') as Stroke;
    return accent ? { stroke, accent } : { stroke };
  });
}

/** `'B 3 2 3'` → pick steps; `1,2,3` plays strings together. */
function pick(pattern: string): Step[] {
  return pattern.split(' ').map((token) => ({
    strings: token.split(',').map((ref) => (ref.startsWith('B') ? ref : Number(ref)) as StringRef),
  }));
}

// Six and eight strokes follow the most frequent notations in the user's song notes.
export const RHYTHM_PRESETS: readonly RhythmPreset[] = [
  { id: 'down-4', name: 'Вниз по долям', kind: 'strum', time: '4/4', steps: strum('D D D D') },
  { id: 'four', name: 'Четвёрка', kind: 'strum', time: '4/4', steps: strum('>D U >D U') },
  { id: 'six', name: 'Шестёрка', kind: 'strum', time: '4/4', steps: strum('D - D U - U D U') },
  {
    id: 'six-muted',
    name: 'Шестёрка с глушением',
    kind: 'strum',
    time: '4/4',
    steps: strum('D - x U - U x U'),
  },
  { id: 'eight', name: 'Восьмёрка', kind: 'strum', time: '4/4', steps: strum('D D U U D D D U') },
  { id: 'waltz', name: 'Вальс', kind: 'strum', time: '3/4', steps: strum('D - D U D U') },
  {
    id: 'pick-four',
    name: 'Перебор «четвёрка»',
    kind: 'pick',
    time: '4/4',
    steps: pick('B 3 2 3 B 3 2 3'),
  },
  {
    id: 'pick-eight',
    name: 'Перебор «восьмёрка»',
    kind: 'pick',
    time: '4/4',
    steps: pick('B 3 2 3 1 3 2 3'),
  },
  {
    id: 'pick-three',
    name: 'Перебор «тройка»',
    kind: 'pick',
    time: '3/4',
    steps: pick('B 3 2 1 2 3'),
  },
  { id: 'pinch', name: 'Щипок', kind: 'pick', time: '4/4', steps: pick("B 1,2,3 B' 1,2,3") },
];
