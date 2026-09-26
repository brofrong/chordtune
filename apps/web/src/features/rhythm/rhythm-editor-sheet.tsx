'use client';

import {
  MAX_STEPS,
  type Rhythm,
  type RhythmKind,
  type Step,
  type StringRef,
  type Stroke,
  strumSymbols,
  type TimeSignature,
} from '@chordtune/chord-sheet';
import { Play, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';
import { DEFAULT_PREVIEW_CHORD, patternPlayback } from './playback';
import type { StrumPlayerControls } from './use-strum-player';

const STROKE_CYCLE: (Stroke | null)[] = ['D', 'U', 'd', 'u', 'x', null];
const STEP_COUNTS = [3, 4, 6, 8, 12, 16] as const;
const TIMES: TimeSignature[] = ['4/4', '3/4', '6/8'];
// Tab order: high string on top, the bass references at the bottom.
const PICK_ROWS: StringRef[] = [1, 2, 3, 4, 5, 6, "B'", 'B'];
const PREVIEW_ID = 'rhythm-preview';

function resize(steps: Step[], count: number): Step[] {
  return Array.from({ length: count }, (_, i) => steps[i] ?? null);
}

function nextStroke(step: Step): Step {
  const index = STROKE_CYCLE.indexOf(step?.stroke ?? null);
  const stroke = STROKE_CYCLE[(index + 1) % STROKE_CYCLE.length] ?? null;
  return stroke ? { stroke, ...(step?.accent ? { accent: true } : {}) } : null;
}

function togglePickString(step: Step, ref: StringRef): Step {
  const strings = step?.strings ?? [];
  const next = strings.includes(ref) ? strings.filter((s) => s !== ref) : [...strings, ref];
  return next.length > 0 ? { strings: next, ...(step?.accent ? { accent: true } : {}) } : null;
}

function toggleAccent(step: Step): Step {
  if (!step) {
    return null;
  }
  const { accent, ...rest } = step;
  return accent ? rest : { ...rest, accent: true };
}

export function RhythmEditorSheet({
  rhythm,
  chords,
  bpm,
  player,
  onSave,
  onClose,
}: {
  rhythm: Rhythm | null;
  chords: string[];
  bpm: number;
  player: StrumPlayerControls;
  onSave: (rhythm: Rhythm) => void;
  onClose: () => void;
}) {
  const t = useTranslations('rhythm');
  const [draft, setDraft] = useState<Rhythm | null>(rhythm);
  const [chord, setChord] = useState(chords[0] ?? DEFAULT_PREVIEW_CHORD);
  const previewing = player.playing === PREVIEW_ID;

  useEffect(() => setDraft(rhythm), [rhythm]);

  // Restart the loop when the pattern or the chord changes while it is playing.
  const playedKey = useRef('');
  const { play } = player;
  useEffect(() => {
    const key = JSON.stringify([draft, chord, bpm]);
    if (previewing && draft && key !== playedKey.current) {
      playedKey.current = key;
      const { notes, loopSec } = patternPlayback(draft, chord, bpm);
      void play(PREVIEW_ID, notes, { loopSec });
    }
  }, [draft, chord, bpm, previewing, play]);

  const close = () => {
    if (previewing) {
      player.stop();
    }
    onClose();
  };

  const update = (patch: Partial<Rhythm>) =>
    setDraft((current) => current && { ...current, ...patch });
  const setStep = (index: number, step: Step) =>
    setDraft(
      (current) =>
        current && { ...current, steps: current.steps.map((s, i) => (i === index ? step : s)) },
    );

  const loopSec = draft ? patternPlayback(draft, chord, bpm).loopSec : 1;
  const activeStep =
    previewing && draft
      ? Math.floor(((player.position % loopSec) / loopSec) * draft.steps.length)
      : null;
  const previewChords = [...new Set([...chords, DEFAULT_PREVIEW_CHORD])];

  return (
    <Sheet open={draft !== null} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] max-w-2xl overflow-y-auto rounded-t-xl"
      >
        {draft && (
          <div className="flex flex-col gap-4 p-4 pt-0">
            <SheetHeader className="px-0">
              <SheetTitle>{t('editorTitle', { key: draft.key })}</SheetTitle>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label htmlFor="rhythm-name">{t('name')}</Label>
                <Input
                  id="rhythm-name"
                  value={draft.name}
                  maxLength={60}
                  onChange={(event) => update({ name: event.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('time')}</Label>
                <Select
                  value={draft.time}
                  onValueChange={(time) => time && update({ time: time as TimeSignature })}
                  items={TIMES.map((time) => ({ value: time, label: time }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMES.map((time) => (
                      <SelectItem key={time} value={time}>
                        {time}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>{t('steps')}</Label>
                <Select
                  value={String(draft.steps.length)}
                  onValueChange={(count) =>
                    count && update({ steps: resize(draft.steps, Number(count)) })
                  }
                  items={STEP_COUNTS.map((count) => ({
                    value: String(count),
                    label: String(count),
                  }))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STEP_COUNTS.map((count) => (
                      <SelectItem key={count} value={String(count)}>
                        {count}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <ToggleGroup
              value={[draft.kind]}
              onValueChange={(value) => {
                const kind = value[0] as RhythmKind | undefined;
                if (kind && kind !== draft.kind) {
                  update({ kind, steps: draft.steps.map(() => null) });
                }
              }}
              variant="outline"
              className="w-full"
            >
              <ToggleGroupItem value="strum" className="flex-1">
                {t('strum')}
              </ToggleGroupItem>
              <ToggleGroupItem value="pick" className="flex-1">
                {t('pick')}
              </ToggleGroupItem>
            </ToggleGroup>

            <p className="text-muted-foreground text-xs">
              {draft.kind === 'strum' ? t('strumHint') : t('pickHint')}
            </p>

            <div className="overflow-x-auto">
              {draft.kind === 'strum' ? (
                <StrumGrid rhythm={draft} activeStep={activeStep} onStep={setStep} />
              ) : (
                <PickGrid rhythm={draft} activeStep={activeStep} onStep={setStep} />
              )}
            </div>

            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1.5">
                <Label>{t('previewChord')}</Label>
                <Select
                  value={chord}
                  onValueChange={(value) => value && setChord(value)}
                  items={previewChords.map((value) => ({ value, label: value }))}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {previewChords.map((value) => (
                      <SelectItem key={value} value={value}>
                        {value}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                aria-label={t('play')}
                onClick={() => {
                  const { notes, loopSec: loop } = patternPlayback(draft, chord, bpm);
                  playedKey.current = JSON.stringify([draft, chord, bpm]);
                  player.toggle(PREVIEW_ID, notes, { loopSec: loop });
                }}
              >
                {previewing ? <Square /> : <Play />}
                {t('play')}
              </Button>
              <Button
                className="ml-auto"
                disabled={draft.steps.length > MAX_STEPS}
                onClick={() => {
                  onSave({ ...draft, name: draft.name.trim() || t(draft.kind) });
                  close();
                }}
              >
                {t('done')}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

type GridProps = {
  rhythm: Rhythm;
  activeStep: number | null;
  onStep: (index: number, step: Step) => void;
};

function StrumGrid({ rhythm, activeStep, onStep }: GridProps) {
  const t = useTranslations('rhythm');
  const symbols = strumSymbols(rhythm);
  return (
    <div className="flex gap-1">
      {rhythm.steps.map((step, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional
        <div key={index} className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => onStep(index, nextStroke(step))}
            className={cn(
              'flex size-10 items-center justify-center rounded-md border border-border font-mono text-lg transition-colors',
              step ? 'bg-muted text-foreground' : 'text-muted-foreground',
              step?.accent && 'font-bold text-primary',
              activeStep === index && 'ring-2 ring-primary',
            )}
          >
            {symbols[index]}
          </button>
          <AccentDot
            active={Boolean(step?.accent)}
            disabled={!step}
            label={t('accent')}
            onClick={() => onStep(index, toggleAccent(step))}
          />
        </div>
      ))}
    </div>
  );
}

function PickGrid({ rhythm, activeStep, onStep }: GridProps) {
  const t = useTranslations('rhythm');
  const rowLabel = (ref: StringRef) =>
    ref === 'B' ? t('bass') : ref === "B'" ? t('altBass') : String(ref);
  return (
    <div className="inline-flex flex-col gap-1">
      {PICK_ROWS.map((ref) => (
        <div key={ref} className="flex items-center gap-1">
          <span className="w-6 text-right font-mono text-muted-foreground text-xs">
            {rowLabel(ref)}
          </span>
          {rhythm.steps.map((step, index) => {
            const on = step?.strings?.includes(ref) ?? false;
            return (
              <button
                // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional
                key={index}
                type="button"
                aria-pressed={on}
                onClick={() => onStep(index, togglePickString(step, ref))}
                className={cn(
                  'size-7 rounded border border-border transition-colors',
                  on ? 'bg-primary' : 'bg-transparent hover:bg-muted',
                  activeStep === index && 'ring-2 ring-primary/60',
                )}
              />
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-1">
        <span className="w-6" />
        {rhythm.steps.map((step, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: steps are positional
          <span key={index} className="flex w-7 justify-center">
            <AccentDot
              active={Boolean(step?.accent)}
              disabled={!step}
              label={t('accent')}
              onClick={() => onStep(index, toggleAccent(step))}
            />
          </span>
        ))}
      </div>
    </div>
  );
}

function AccentDot({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className="flex size-6 items-center justify-center disabled:opacity-30"
    >
      <span
        className={cn(
          'size-2 rounded-full border border-muted-foreground',
          active && 'border-primary bg-primary',
        )}
      />
    </button>
  );
}
