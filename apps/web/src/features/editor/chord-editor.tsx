'use client';

import {
  type Diagnostic,
  fromChordsOverLyrics,
  type ImportedSong,
  type Rhythm,
  type SongDoc,
  serialize,
  toChordsOverLyrics,
  validate,
} from '@chordtune/chord-sheet';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { sectionPlayback } from '@/features/rhythm/playback';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { EditorDock } from './editor-dock';
import { TextEditor } from './text-editor';
import { type ActiveChord, VisualEditor } from './visual-editor';

export type EditorMode = 'visual' | 'text' | 'check';
type Mode = EditorMode;

const UNKNOWN_RHYTHM_RE = /^Unknown rhythm: (\w)$/;

/** Rhythm markers that point at missing patterns; they block saving. */
export function unknownRhythmKeys(doc: SongDoc, rhythms: Rhythm[]): string[] {
  const keys = validate(doc, rhythms).flatMap(
    (diagnostic) => UNKNOWN_RHYTHM_RE.exec(diagnostic.message)?.[1] ?? [],
  );
  return [...new Set(keys)];
}

export function ChordEditor({
  doc,
  docVersion,
  onDocChange,
  onImport,
  rhythms,
  bpm,
  player,
  preview,
}: {
  doc: SongDoc;
  /** Bumped when the document is replaced from outside (draft, import), to refresh the text. */
  docVersion: number;
  onDocChange: (doc: SongDoc) => void;
  onImport: (song: ImportedSong) => void;
  rhythms: Rhythm[];
  bpm: number;
  player: StrumPlayerControls;
  /** The song page as readers will see it, for «Проверить». */
  preview: React.ReactNode;
}) {
  const t = useTranslations('editor');
  // An empty song starts as text: typing is the quickest way in.
  const [mode, setMode] = useState<Mode>(() => (serialize(doc).trim() ? 'visual' : 'text'));
  const [text, setText] = useState(() => toChordsOverLyrics(doc));
  const [errors, setErrors] = useState<Diagnostic[]>([]);
  const [blocked, setBlocked] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: only an outside replacement resets the text
  useEffect(() => {
    setText(toChordsOverLyrics(doc));
    setErrors([]);
  }, [docVersion]);

  const changeText = (value: string) => {
    setText(value);
    setBlocked(false);
    const parsed = fromChordsOverLyrics(value);
    setErrors(parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'error'));
    onDocChange(parsed.doc);
  };

  const switchMode = (next: Mode) => {
    if (next === mode) {
      return;
    }
    if (next !== 'text' && errors.length > 0) {
      setBlocked(true);
      return;
    }
    if (next === 'text') {
      setText(toChordsOverLyrics(doc));
    }
    player.stop();
    setMode(next);
  };

  const playingSection = Number(player.playing?.match(/^section:(\d+)$/)?.[1] ?? Number.NaN);
  let active: ActiveChord = null;
  if (!Number.isNaN(playingSection)) {
    const { events, seconds } = sectionPlayback(doc, rhythms, playingSection, bpm);
    const index = seconds.findIndex(
      (span) => player.position >= span.start && player.position < span.end,
    );
    const event = events[index];
    active = event ? { section: event.section, line: event.line, item: event.item } : null;
  }

  const missing = unknownRhythmKeys(doc, rhythms);

  return (
    <section className="flex flex-col gap-3">
      {mode === 'check' ? (
        preview
      ) : mode === 'text' ? (
        <TextEditor text={text} onTextChange={changeText} onImport={onImport} />
      ) : (
        <VisualEditor
          doc={doc}
          onChange={onDocChange}
          rhythms={rhythms}
          active={active}
          playingSection={Number.isNaN(playingSection) ? null : playingSection}
          onPlaySection={(section) => {
            const { notes } = sectionPlayback(doc, rhythms, section, bpm);
            player.toggle(`section:${section}`, notes);
          }}
        />
      )}

      {(errors.length > 0 || missing.length > 0 || blocked) && (
        <ul className="flex flex-col gap-1 text-destructive text-sm">
          {blocked && <li>{t('switchBlocked')}</li>}
          {errors.map((error) => (
            <li key={`${error.line}:${error.col}:${error.message}`}>
              {t('lineError', { line: error.line, message: error.message })}
            </li>
          ))}
          {missing.map((key) => (
            <li key={key}>{t('unknownRhythm', { key })}</li>
          ))}
        </ul>
      )}
      <EditorDock mode={mode} onChange={switchMode} />
    </section>
  );
}
