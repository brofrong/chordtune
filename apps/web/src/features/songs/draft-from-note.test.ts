/// <reference types="bun" />

import { expect, test } from 'bun:test';

import { draftFromNote } from './draft-from-note';

test('an Obsidian note fills artist, title, rhythm and content', () => {
  const draft = draftFromNote(
    '#LUMEN - Гореть\nБой: ↓↓↑↑↓↑\n```chords\n[Куплет]\nAm   G\nЗачем кричать\n```',
  );
  expect(draft).toMatchObject({ artist: 'LUMEN', title: 'Гореть' });
  expect(draft?.rhythms[0]?.name).toBe('Шестёрка');
  expect(draft?.content).toContain('${Am}');
});

test('plain chords over lyrics become content only', () => {
  const draft = draftFromNote('Am        G\nЗачем кричать, когда никто не слышит');
  expect(draft).toMatchObject({ artist: '', title: '' });
  expect(draft?.content).toBe('${Am}Зачем крич${G}ать, когда никто не слышит');
});

test('text without chords is rejected', () => {
  expect(draftFromNote('просто текст без аккордов')).toBeNull();
  expect(draftFromNote('')).toBeNull();
});
