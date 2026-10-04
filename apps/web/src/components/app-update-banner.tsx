'use client';

import { RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { spring } from '@/lib/motion';
import { useAppUpdate } from '@/lib/use-app-update';

const RELEASES_URL = 'https://github.com/brofrong/chordtune/releases/latest';

/** Offers a downloaded live update, or a new APK when the native shell is too old for the server. */
export function AppUpdateBanner() {
  const t = useTranslations('update');
  const { state, restart, dismiss } = useAppUpdate();

  return (
    <AnimatePresence>
      {state !== 'idle' && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={spring.pop}
          className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-popover/95 p-3 shadow-lg backdrop-blur-xl md:bottom-6"
        >
          <RefreshCw className="size-4 shrink-0 text-primary" />
          <span className="flex-1 font-medium text-sm">
            {state === 'ready' ? t('ready') : t('nativeTitle')}
          </span>
          <Button variant="ghost" size="sm" onClick={dismiss}>
            {t('later')}
          </Button>
          {state === 'ready' ? (
            <Button size="sm" onClick={restart}>
              {t('restart')}
            </Button>
          ) : (
            // A plain link: Capacitor opens other hosts in the system browser.
            <a href={RELEASES_URL} onClick={dismiss} className={buttonVariants({ size: 'sm' })}>
              {t('download')}
            </a>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
