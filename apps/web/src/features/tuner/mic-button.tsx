'use client';

import { Loader2, Mic, MicOff } from 'lucide-react';
import { type MotionValue, motion, useTransform } from 'motion/react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';

import type { TunerStatus } from './use-tuner-session';

export function MicButton({
  status,
  level,
  onStart,
  onStop,
}: {
  status: TunerStatus;
  level: MotionValue<number>;
  onStart: () => void;
  onStop: () => void;
}) {
  const t = useTranslations('tuner');
  const listening = status === 'listening';
  const pulse = useTransform(level, [0, 1], [1, 1.45]);
  const glow = useTransform(level, [0, 1], [0.15, 0.55]);

  return (
    <div className="relative grid place-items-center">
      {listening && (
        <motion.span
          aria-hidden
          className="absolute size-16 rounded-full bg-primary"
          style={{ scale: pulse, opacity: glow }}
        />
      )}
      <motion.button
        type="button"
        whileTap={{ scale: 0.94 }}
        onClick={listening ? onStop : onStart}
        disabled={status === 'starting'}
        aria-label={listening ? t('stop') : t('start')}
        className={cn(
          'relative grid size-16 place-items-center rounded-full shadow-lg transition-colors disabled:opacity-60',
          listening
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary text-foreground hover:bg-muted',
        )}
      >
        {status === 'starting' ? (
          <Loader2 className="size-6 animate-spin" />
        ) : listening ? (
          <Mic className="size-6" />
        ) : (
          <MicOff className="size-6" />
        )}
      </motion.button>
    </div>
  );
}
