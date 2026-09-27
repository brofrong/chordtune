'use client';

import { Bookmark, Eye, Guitar, Heart } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useToast } from '@/components/toast';
import { isCapacitor } from '@/features/song/links';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';
import { CountRoll } from './count-roll';
import { Sparks } from './sparks';
import type { useSongActions } from './use-song-actions';

type Actions = ReturnType<typeof useSongActions>;

const pill =
  'relative inline-flex h-9 items-center gap-1.5 rounded-full border px-3 font-semibold text-sm transition-colors disabled:opacity-50';

/** Views, then like / save / played buttons with a little celebration on each. */
export function SongActions({ actions }: { actions: Actions }) {
  const t = useTranslations('song');
  const toast = useToast();
  const [likeBurst, setLikeBurst] = useState(0);
  const [saveBurst, setSaveBurst] = useState(0);
  const [playBurst, setPlayBurst] = useState(0);
  const { stats, me, pending, online } = actions;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className="inline-flex items-center gap-1.5 pr-1 text-muted-foreground text-sm tabular-nums"
        title={t('views')}
      >
        <Eye className="size-4" />
        {formatCount(stats.views)}
      </span>
      <span className="h-5 w-px bg-border" />

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        aria-pressed={me.liked}
        aria-label={t('like')}
        title={online ? t('like') : t('needNetwork')}
        disabled={pending === 'like' || !online}
        onClick={async () => {
          if (!me.liked) {
            setLikeBurst((n) => n + 1);
          }
          await actions.toggleLike();
        }}
        className={cn(
          pill,
          me.liked
            ? 'border-like/40 bg-like/15 text-like'
            : 'border-border bg-surface text-foreground/80 hover:bg-surface-2',
        )}
      >
        <motion.span
          key={likeBurst}
          initial={false}
          animate={likeBurst ? { scale: [1, 0.6, 1.35, 1] } : undefined}
          transition={{ duration: 0.45, times: [0, 0.3, 0.65, 1] }}
          className="flex"
        >
          <Heart className="size-4" fill={me.liked ? 'currentColor' : 'none'} />
        </motion.span>
        {likeBurst > 0 && me.liked && <Sparks key={likeBurst} />}
        <CountRoll value={stats.likes} />
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        aria-pressed={me.saved}
        aria-label={t('save')}
        title={online ? t('save') : t('needNetwork')}
        disabled={pending === 'save' || !online}
        onClick={async () => {
          const wasSaved = me.saved;
          if (!wasSaved) {
            setSaveBurst((n) => n + 1);
          }
          const saved = await actions.toggleSave();
          if (saved) {
            toast(isCapacitor ? t('savedOfflineToast') : t('savedToast'));
          }
        }}
        className={cn(
          pill,
          me.saved
            ? 'border-saved/40 bg-saved/15 text-saved'
            : 'border-border bg-surface text-foreground/80 hover:bg-surface-2',
        )}
      >
        <span className="relative flex">
          {saveBurst > 0 && me.saved && (
            <svg
              key={saveBurst}
              aria-hidden
              className="-inset-[5px] absolute size-[26px] -rotate-90"
              viewBox="0 0 26 26"
            >
              <motion.circle
                cx="13"
                cy="13"
                r="11.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                initial={{ pathLength: 0, opacity: 1 }}
                animate={{ pathLength: 1, opacity: [1, 1, 0] }}
                transition={{ duration: 0.9, times: [0, 0.75, 1] }}
              />
            </svg>
          )}
          <motion.span
            key={saveBurst}
            initial={false}
            animate={saveBurst ? { y: [-8, 2, 0], scale: [0.8, 1.15, 1] } : undefined}
            transition={{ duration: 0.5 }}
            className="flex"
          >
            <Bookmark className="size-4" fill={me.saved ? 'currentColor' : 'none'} />
          </motion.span>
        </span>
        <CountRoll value={stats.saves} />
      </motion.button>

      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        aria-label={t('played')}
        title={t('played')}
        onClick={async () => {
          setPlayBurst((n) => n + 1);
          await actions.addPlayed();
        }}
        className={cn(pill, 'border-primary/35 bg-primary/10 text-foreground hover:bg-primary/15')}
      >
        <motion.span
          key={playBurst}
          initial={false}
          animate={playBurst ? { rotate: [0, -18, 12, 0] } : undefined}
          transition={{ duration: 0.5 }}
          className="flex text-primary"
        >
          <Guitar className="size-4" />
        </motion.span>
        <CountRoll value={me.played} />
        <AnimatePresence>
          {playBurst > 0 && (
            <motion.span
              key={playBurst}
              aria-hidden
              className="pointer-events-none absolute -top-1 right-2 font-extrabold text-primary text-xs"
              initial={{ y: 0, opacity: 0, scale: 0.8 }}
              animate={{ y: -26, opacity: [0, 1, 0], scale: [0.8, 1.2, 1] }}
              transition={{ duration: 0.8 }}
            >
              +1
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
