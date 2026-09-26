'use client';

import { ArrowDown, ArrowUp, Check } from 'lucide-react';
import { AnimatePresence, type MotionValue, motion, useTransform } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { cn } from '@/lib/utils';

import { DebugPanel } from './debug-panel';
import { MicButton } from './mic-button';
import type { TuneZone } from './reading';
import { analyzerSettings, resolveTuning, useTunerSettings } from './settings';
import { StringRow } from './string-row';
import { TunerGauge } from './tuner-gauge';
import { TunerSettingsSheet } from './tuner-settings-sheet';
import { type ReadingView, useTunerReading } from './use-tuner-reading';
import { useTunerSession } from './use-tuner-session';

const ZONE_TEXT: Record<TuneZone, string> = {
  in: 'text-tune-in',
  near: 'text-tune-near',
  off: 'text-tune-off',
};

export function TunerScreen() {
  const t = useTranslations('tuner');
  const [settings, updateSettings] = useTunerSettings();
  const tuning = resolveTuning(settings);
  const tuningKey = `${tuning.instrument}/${tuning.id}`;
  // Keyed by tuning so switching tunings drops the lock without an effect.
  const [lock, setLock] = useState<{ key: string; index: number | null }>({
    key: tuningKey,
    index: null,
  });
  const lockedIndex = lock.key === tuningKey ? lock.index : null;

  const session = useTunerSession(analyzerSettings(settings));
  const reading = useTunerReading(session.store, tuning, lockedIndex, settings.a4);
  const listening = session.status === 'listening';
  const active = listening && !reading.view.stale;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center gap-5 px-4 py-5">
      <TunerSettingsSheet settings={settings} onChange={updateSettings} />

      <div className="relative flex w-full justify-center">
        <TunerGauge
          cents={reading.cents}
          zone={active ? reading.view.zone : null}
          active={active}
        />
        <div className="absolute inset-x-0 top-[34%] flex justify-center">
          <NoteName view={reading.view} active={active} listening={listening} />
        </div>
      </div>

      <Readout
        view={reading.view}
        cents={reading.cents}
        frequency={reading.frequency}
        active={active}
      />

      {tuning.strings.length > 0 && (
        <StringRow
          tuning={tuning}
          a4={settings.a4}
          activeIndex={active ? reading.view.targetIndex : null}
          zone={active ? reading.view.zone : null}
          lockedIndex={lockedIndex}
          tuned={reading.tuned}
          onLock={(index) => setLock({ key: tuningKey, index })}
        />
      )}

      <div className="mt-auto flex flex-col items-center gap-3 pt-4">
        <MicButton
          status={session.status}
          level={reading.level}
          onStart={() => void session.start()}
          onStop={session.stop}
        />
        <p
          className={cn(
            'min-h-5 text-center text-sm',
            session.error ? 'text-destructive' : 'text-muted-foreground',
          )}
        >
          {session.error
            ? t(`errors.${session.error}`)
            : listening
              ? active
                ? null
                : t('listening')
              : t('idle')}
        </p>
      </div>

      {settings.debug && <DebugPanel store={session.store} />}
    </div>
  );
}

function NoteName({
  view,
  active,
  listening,
}: {
  view: ReadingView;
  active: boolean;
  listening: boolean;
}) {
  const shown = listening && view.noteName != null;
  return (
    <div
      className={cn(
        'flex items-start font-semibold leading-none transition-[color,opacity] duration-300',
        active && view.zone ? ZONE_TEXT[view.zone] : 'text-foreground',
        !active && 'opacity-40',
      )}
    >
      <span className="text-7xl tracking-tight sm:text-8xl">{shown ? view.noteName : '—'}</span>
      {shown && <span className="mt-2 text-muted-foreground text-xl">{view.octave}</span>}
    </div>
  );
}

function Readout({
  view,
  cents,
  frequency,
  active,
}: {
  view: ReadingView;
  cents: MotionValue<number>;
  frequency: MotionValue<number>;
  active: boolean;
}) {
  const t = useTranslations('tuner');
  const centsText = useTransform(cents, (value) => {
    const rounded = Math.round(value);
    return rounded > 0 ? `+${rounded}` : `${rounded}`;
  });
  const hzText = useTransform(frequency, (value) => value.toFixed(1));
  const detected = view.noteName == null ? null : `${view.noteName}${view.octave}`;
  const showTarget = active && view.targetLabel != null && view.targetLabel !== detected;

  return (
    <div className="flex min-h-16 flex-col items-center gap-2">
      <div
        className={cn(
          'flex items-baseline gap-3 font-mono text-muted-foreground text-sm tabular-nums transition-opacity',
          !active && 'opacity-0',
        )}
      >
        <span>
          <motion.span>{centsText}</motion.span> {t('centsUnit')}
        </span>
        <span aria-hidden>·</span>
        <span>
          <motion.span>{hzText}</motion.span> {t('hzUnit')}
        </span>
        {showTarget && (
          <>
            <span aria-hidden>·</span>
            <span>{t('target', { note: view.targetLabel ?? '' })}</span>
          </>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {active && view.zone && (
          <motion.div
            key={view.zone === 'in' ? 'in' : view.direction}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className={cn(
              'flex items-center gap-1.5 rounded-full px-3 py-1 font-medium text-sm',
              view.zone === 'in' ? 'bg-tune-in/15 text-tune-in' : 'bg-muted text-foreground',
            )}
          >
            {view.zone === 'in' ? (
              <>
                <Check className="size-4" /> {t('inTune')}
              </>
            ) : view.direction === 'up' ? (
              <>
                <ArrowUp className="size-4" /> {t('tuneUp')}
              </>
            ) : (
              <>
                <ArrowDown className="size-4" /> {t('tuneDown')}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
