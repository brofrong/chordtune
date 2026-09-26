'use client';

import {
  RHYTHM_PRESETS,
  type Rhythm,
  type RhythmKind,
  rhythmFromPreset,
} from '@chordtune/chord-sheet';
import { Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DEFAULT_PREVIEW_CHORD, patternPlayback } from './playback';
import { RhythmBadge } from './rhythm-badge';
import { RhythmEditorSheet } from './rhythm-editor-sheet';
import { RhythmStrip } from './rhythm-strip';
import type { StrumPlayerControls } from './use-strum-player';

const KEYS = 'ABCDEFGHIJKLMNOP';

function nextKey(rhythms: Rhythm[]): string | null {
  const used = new Set(rhythms.map((rhythm) => rhythm.key));
  return [...KEYS].find((key) => !used.has(key)) ?? null;
}

export function RhythmList({
  rhythms,
  onChange,
  chords,
  bpm,
  player,
}: {
  rhythms: Rhythm[];
  onChange: (rhythms: Rhythm[]) => void;
  chords: string[];
  bpm: number;
  player: StrumPlayerControls;
}) {
  const t = useTranslations('rhythm');
  const [editing, setEditing] = useState<Rhythm | null>(null);
  const [adding, setAdding] = useState(false);
  const key = nextKey(rhythms);

  const add = (rhythm: Rhythm) => {
    onChange([...rhythms, rhythm]);
    setAdding(false);
    setEditing(rhythm);
  };
  const addEmpty = (kind: RhythmKind, newKey: string) =>
    add({
      key: newKey,
      name: t(kind),
      kind,
      time: '4/4',
      steps: Array.from({ length: 8 }, () => null),
    });

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className="text-muted-foreground text-xs uppercase tracking-wide">{t('title')}</h2>
        {key && (
          <Popover open={adding} onOpenChange={setAdding}>
            <PopoverTrigger render={<Button variant="ghost" size="sm" />}>
              <Plus />
              {t('add')}
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 gap-1">
              <span className="px-1 text-muted-foreground text-xs">{t('presets')}</span>
              {RHYTHM_PRESETS.map((preset) => (
                <Button
                  key={preset.id}
                  variant="ghost"
                  size="sm"
                  className="justify-between"
                  onClick={() =>
                    add({
                      ...rhythmFromPreset(preset, key),
                      name: t(`presetNames.${preset.id}` as 'presetNames.six'),
                    })
                  }
                >
                  {t(`presetNames.${preset.id}` as 'presetNames.six')}
                  <RhythmStrip rhythm={preset} className="text-xs" />
                </Button>
              ))}
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => addEmpty('strum', key)}
              >
                {t('emptyStrum')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="justify-start"
                onClick={() => addEmpty('pick', key)}
              >
                {t('emptyPick')}
              </Button>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {rhythms.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {rhythms.map((rhythm) => {
            const id = `rhythm:${rhythm.key}`;
            return (
              <li key={rhythm.key} className="flex items-center gap-2">
                <RhythmBadge rhythmKey={rhythm.key} />
                <span className="min-w-0 truncate text-sm">{rhythm.name}</span>
                <RhythmStrip rhythm={rhythm} className="hidden text-xs sm:inline-flex" />
                <span className="ml-auto flex">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('play')}
                    onClick={() => {
                      const { notes, loopSec } = patternPlayback(
                        rhythm,
                        chords[0] ?? DEFAULT_PREVIEW_CHORD,
                        bpm,
                      );
                      player.toggle(id, notes, { loopSec });
                    }}
                  >
                    {player.playing === id ? <Square /> : <Play />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('edit')}
                    onClick={() => setEditing(rhythm)}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('remove')}
                    onClick={() => onChange(rhythms.filter((r) => r.key !== rhythm.key))}
                  >
                    <Trash2 />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <RhythmEditorSheet
        rhythm={editing}
        chords={chords}
        bpm={bpm}
        player={player}
        onSave={(saved) => onChange(rhythms.map((r) => (r.key === saved.key ? saved : r)))}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}
