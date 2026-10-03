'use client';

import type { ZenModeId } from '@chordtune/chord-sheet';
import { Play, SkipBack } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { SpeedChips } from '@/features/song/speed-chips';

/** Before the start and on pause: how chords look, speed, capo, and where to go. */
export function ZenPanel({
  phase,
  mode,
  onModeChange,
  speed,
  onSpeedChange,
  capoControl,
  onStart,
  onFromStart,
}: {
  phase: 'ready' | 'pause';
  mode: ZenModeId;
  onModeChange: (mode: ZenModeId) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  capoControl?: React.ReactNode;
  onStart: () => void;
  onFromStart: () => void;
}) {
  const t = useTranslations('zen');
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-3 rounded-3xl border border-border bg-popover/95 p-4 shadow-lg backdrop-blur-xl">
      <p className="text-center text-muted-foreground text-xs">{t('pickStart')}</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ToggleGroup
          variant="outline"
          spacing={0}
          aria-label={t('view')}
          value={[mode]}
          onValueChange={(value) => {
            if (value[0] === 'inline' || value[0] === 'strip') {
              onModeChange(value[0]);
            }
          }}
        >
          <ToggleGroupItem value="inline" className="px-3">
            {t('viewInline')}
          </ToggleGroupItem>
          <ToggleGroupItem value="strip" className="px-3">
            {t('viewStrip')}
          </ToggleGroupItem>
        </ToggleGroup>
        {capoControl && <span className="text-sm">{capoControl}</span>}
      </div>
      <SpeedChips speed={speed} onChange={onSpeedChange} className="justify-center" />
      <div className="flex gap-2">
        <Button variant="outline" className="h-12 rounded-2xl" onClick={onFromStart}>
          <SkipBack />
          {t('fromStart')}
        </Button>
        <Button className="h-12 flex-1 rounded-2xl text-base shadow-glow" onClick={onStart}>
          <Play />
          {phase === 'ready' ? t('start') : t('resume')}
        </Button>
      </div>
    </div>
  );
}
