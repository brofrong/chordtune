'use client';

import { Check, LoaderCircle } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { spring } from '@/lib/motion';

export type SaveState = 'idle' | 'saving' | 'saved';

/** «Сохранить» → spinner → check mark, resizing smoothly between them. */
export function SaveButton({ state, onClick }: { state: SaveState; onClick: () => void }) {
  const t = useTranslations('editor');
  return (
    <motion.button
      type="button"
      layout
      transition={spring.soft}
      whileTap={{ scale: 0.95 }}
      disabled={state !== 'idle'}
      onClick={onClick}
      className="flex h-9 items-center justify-center overflow-hidden rounded-full bg-primary px-4 font-semibold text-primary-foreground text-sm shadow-glow"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={state}
          initial={{ opacity: 0, y: 12, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12, scale: 0.8 }}
          transition={spring.pop}
          className="flex items-center gap-1.5"
        >
          {state === 'idle' && t('save')}
          {state === 'saving' && (
            <LoaderCircle className="size-4 animate-spin" aria-label={t('saving')} />
          )}
          {state === 'saved' && (
            <>
              <Check className="size-4" />
              {t('savedShort')}
            </>
          )}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
