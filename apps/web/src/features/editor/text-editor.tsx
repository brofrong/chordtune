'use client';

import { type ImportedSong, importObsidian } from '@chordtune/chord-sheet';
import { useTranslations } from 'next-intl';

import { Textarea } from '@/components/ui/textarea';

const OBSIDIAN_HINTS = [/```chords/, /^#[^#\n].*\s[-—–]\s/m, /^\s*(Бой|Перебор|Паттерн)\s*:/im];

function looksLikeObsidianNote(text: string): boolean {
  return OBSIDIAN_HINTS.some((hint) => hint.test(text));
}

/** Chords over lyrics in a monospace textarea; a pasted Obsidian note fills the whole form. */
export function TextEditor({
  text,
  onTextChange,
  onImport,
}: {
  text: string;
  onTextChange: (text: string) => void;
  onImport: (song: ImportedSong) => void;
}) {
  const t = useTranslations('editor');
  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text/plain');
          if (looksLikeObsidianNote(pasted)) {
            event.preventDefault();
            onImport(importObsidian(pasted));
          }
        }}
        placeholder={t('textPlaceholder')}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        className="min-h-[50dvh] overflow-x-auto whitespace-pre font-mono text-sm leading-6"
      />
      <p className="text-muted-foreground text-xs">{t('textHint')}</p>
    </div>
  );
}
