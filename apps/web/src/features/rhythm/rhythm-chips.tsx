'use client';

import {
  RHYTHM_PRESETS,
  type Rhythm,
  type RhythmKind,
  rhythmFromPreset,
} from '@chordtune/chord-sheet';
import { Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { spring } from '@/lib/motion';
import { RhythmBadge } from './rhythm-badge';
import { RhythmEditorSheet } from './rhythm-editor-sheet';
import { RhythmStrip } from './rhythm-strip';
import type { StrumPlayerControls } from './use-strum-player';

const KEYS = 'ABCDEFGHIJKLMNOP';

function nextKey(rhythms: Rhythm[]): string | null {
  const used = new Set(rhythms.map((rhythm) => rhythm.key));
  return [...KEYS].find((key) => !used.has(key)) ?? null;
}

/** The song's rhythms as a strip of chips; tap one to edit, «+» adds a preset or an empty one. */
export function RhythmChips({
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
    <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      <AnimatePresence initial={false}>
        {rhythms.map((rhythm) => (
          <motion.button
            key={rhythm.key}
            type="button"
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={spring.pop}
            whileTap={{ scale: 0.95 }}
            onClick={() => setEditing(rhythm)}
            className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface py-1.5 pr-3 pl-1.5 text-sm transition-colors hover:bg-surface-2"
          >
            <RhythmBadge rhythmKey={rhythm.key} />
            <RhythmStrip rhythm={rhythm} className="text-xs" />
          </motion.button>
        ))}
      </AnimatePresence>
      {key && (
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full border-dashed text-primary"
                aria-label={t('add')}
              />
            }
          >
            <Plus />
            {rhythms.length === 0 && t('title')}
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 gap-1">
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
      <RhythmEditorSheet
        rhythm={editing}
        chords={chords}
        bpm={bpm}
        player={player}
        onSave={(saved) => onChange(rhythms.map((r) => (r.key === saved.key ? saved : r)))}
        onDelete={(removed) => onChange(rhythms.filter((r) => r.key !== removed))}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}
