'use client';

import { Guitar, Play, Square } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';

/** Two compact pills above the tab bar: listen to the song, or play along in zen mode. */
export function SongDock({
  listening,
  listenHint,
  onListen,
  canPlay,
  onPlay,
}: {
  listening: boolean;
  /** «Бой A · 90 BPM», or the current section while playing. */
  listenHint: string;
  onListen: () => void;
  canPlay: boolean;
  onPlay: () => void;
}) {
  const t = useTranslations('song');
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ ...spring.soft, delay: 0.15 }}
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-md gap-2 md:bottom-6"
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        onClick={onListen}
        aria-pressed={listening}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full border border-border bg-popover/90 py-1.5 pr-4 pl-1.5 text-left shadow-lg backdrop-blur-xl"
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-2">
          {listening ? <Square className="size-3.5" /> : <Play className="ml-0.5 size-3.5" />}
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm leading-tight">
            {listening ? t('stop') : t('listen')}
          </span>
          <span className="block truncate text-muted-foreground text-xs leading-tight">
            {listenHint}
          </span>
        </span>
      </motion.button>
      <motion.button
        type="button"
        whileTap={{ scale: 0.95 }}
        disabled={!canPlay}
        onClick={onPlay}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-primary py-1.5 pr-4 pl-1.5 text-left text-primary-foreground shadow-glow',
          'disabled:opacity-40 disabled:shadow-none',
        )}
      >
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary-foreground/12">
          <Guitar className="size-4" />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold text-sm leading-tight">{t('playAlong')}</span>
          <span className="block truncate text-xs leading-tight opacity-70">
            {t('playAlongHint')}
          </span>
        </span>
      </motion.button>
    </motion.div>
  );
}
