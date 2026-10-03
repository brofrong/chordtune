'use client';

import { MAX_TEMPO, MIN_TEMPO, parseAlphaTex } from '@chordtune/chord-sheet';
import { Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { beatAt, tabPlayback } from '@/features/rhythm/playback';
import type { StrumPlayerControls } from '@/features/rhythm/use-strum-player';
import { readBlockMeta, setBlockMeta } from './tab-source';
import { TabStaff } from './tab-staff';

const PREVIEW_ID = 'tab-preview';
const TIMES = ['4/4', '3/4', '6/8', '2/4'];
type CheatKey =
  | 'note'
  | 'duration'
  | 'beatDuration'
  | 'rest'
  | 'chord'
  | 'dead'
  | 'effects'
  | 'bend'
  | 'text'
  | 'lyrics'
  | 'repeat'
  | 'meta';
const CHEATS: [code: string, key: CheatKey][] = [
  ['5.3', 'note'],
  [':8', 'duration'],
  ['5.3.16', 'beatDuration'],
  ['r  r.2', 'rest'],
  ['(0.5 2.4).4', 'chord'],
  ['x.3  -.3', 'dead'],
  ['{d} {tu 3} {h} {sl} {pm}', 'effects'],
  ['{b (0 4)} {v}', 'bend'],
  ['{txt "тише"}', 'text'],
  ['\\lyrics "сло-ва _ пес-ни"', 'lyrics'],
  ['\\ro … \\rc 2', 'repeat'],
  ['\\tempo 140  \\ts 3 4', 'meta'],
];

/** Writes one alphaTex block: the source, a live tablature, problems, and a play button. */
export function TabEditorSheet({
  source,
  bpm,
  capo,
  player,
  onSave,
  onClose,
}: {
  /** `null` keeps the sheet closed. */
  source: string[] | null;
  /** Tempo around the block (section or song); `\tempo` in the block wins. */
  bpm: number;
  capo: number | null;
  player: StrumPlayerControls;
  onSave: (source: string[]) => void;
  onClose: () => void;
}) {
  const t = useTranslations('tab');
  const [text, setText] = useState(source?.join('\n') ?? '');
  useEffect(() => setText(source?.join('\n') ?? ''), [source]);

  const lines = useMemo(() => text.split('\n'), [text]);
  const { block, diagnostics } = useMemo(() => parseAlphaTex(lines), [lines]);
  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  const playback = useMemo(() => tabPlayback(block, { bpm, capo }), [block, bpm, capo]);
  const previewing = player.playing === PREVIEW_ID;
  const activeBeat = previewing ? beatAt(playback, player.position) : null;
  const time = readBlockMeta(lines, 'ts')?.replace(/\s+/, '/') ?? '4/4';

  const setMeta = (command: 'tempo' | 'ts', value: string | null) =>
    setText(setBlockMeta(lines, command, value).join('\n'));

  const close = () => {
    if (previewing) {
      player.stop();
    }
    onClose();
  };

  const save = () => {
    if (previewing) {
      player.stop();
    }
    const end = lines.findLastIndex((line) => line.trim() !== '');
    onSave(lines.slice(0, end + 1));
  };

  return (
    <Sheet open={source !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-xl"
      >
        {source !== null && (
          <div className="flex flex-col gap-4 p-4 pt-0">
            <SheetHeader className="px-0">
              <SheetTitle>{t('title')}</SheetTitle>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tab-tempo">{t('tempo')}</Label>
                <Input
                  id="tab-tempo"
                  type="number"
                  inputMode="numeric"
                  min={MIN_TEMPO}
                  max={MAX_TEMPO}
                  placeholder={String(bpm)}
                  value={readBlockMeta(lines, 'tempo') ?? ''}
                  onChange={(event) => setMeta('tempo', event.target.value || null)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('time')}</Label>
                <Select
                  value={time}
                  items={TIMES.map((value) => ({ value, label: value }))}
                  onValueChange={(value) =>
                    value && setMeta('ts', value === '4/4' ? null : value.replace('/', ' '))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tab-source">{t('source')}</Label>
              <Textarea
                id="tab-source"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={t('placeholder')}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                wrap="off"
                className="min-h-40 overflow-x-auto whitespace-pre font-mono text-sm leading-6"
              />
            </div>

            <TabStaff
              block={block}
              activeBeat={activeBeat}
              className="rounded-md bg-muted/30 p-2"
            />

            {diagnostics.length > 0 && (
              <ul className="flex flex-col gap-1 text-sm">
                {diagnostics.map((diagnostic) => (
                  <li
                    key={`${diagnostic.line}:${diagnostic.col}:${diagnostic.message}`}
                    className={
                      diagnostic.severity === 'error' ? 'text-destructive' : 'text-muted-foreground'
                    }
                  >
                    {t('lineError', { line: diagnostic.line, message: diagnostic.message })}
                  </li>
                ))}
              </ul>
            )}

            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t('cheatsheet')}</summary>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                {CHEATS.map(([code, key]) => (
                  <div key={key} className="contents">
                    <dt className="font-mono text-xs">{code}</dt>
                    <dd className="text-muted-foreground text-xs">{t(`cheat.${key}`)}</dd>
                  </div>
                ))}
              </dl>
            </details>

            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={playback.notes.length === 0}
                onClick={() =>
                  previewing ? player.stop() : void player.play(PREVIEW_ID, playback.notes)
                }
              >
                {previewing ? <Square /> : <Play />}
                {t('play')}
              </Button>
              <Button variant="ghost" className="ml-auto" onClick={close}>
                {t('cancel')}
              </Button>
              <Button disabled={errors.length > 0} onClick={save}>
                {t('done')}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
