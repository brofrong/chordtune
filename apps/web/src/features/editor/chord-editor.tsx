'use client';

import {
  type Diagnostic,
  fromChordsOverLyrics,
  type ImportedSong,
  type Rhythm,
  type SongDoc,
  toChordsOverLyrics,
  validate,
} from '@chordtune/chord-sheet';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { sectionPlayback } from '@/features/rhythm/playback';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { TextEditor } from './text-editor';
import { type ActiveChord, VisualEditor } from './visual-editor';

type Mode = 'text' | 'visual';

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
}: {
  doc: SongDoc;
  /** Bumped when the document is replaced from outside (draft, import), to refresh the text. */
  docVersion: number;
  onDocChange: (doc: SongDoc) => void;
  onImport: (song: ImportedSong) => void;
  rhythms: Rhythm[];
  bpm: number;
  player: StrumPlayerControls;
}) {
  const t = useTranslations('editor');
  const [mode, setMode] = useState<Mode>('text');
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
    if (next === 'visual' && errors.length > 0) {
      setBlocked(true);
      return;
    }
    if (next === 'text') {
      setText(toChordsOverLyrics(doc));
    }
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
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-muted-foreground text-xs uppercase tracking-wide">{t('chords')}</h2>
        <ToggleGroup
          value={[mode]}
          onValueChange={(value) => value[0] && switchMode(value[0] as Mode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="text">{t('modeText')}</ToggleGroupItem>
          <ToggleGroupItem value="visual">{t('modeVisual')}</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {mode === 'text' ? (
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
    </section>
  );
}
