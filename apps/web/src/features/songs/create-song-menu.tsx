'use client';

import { ChevronRight, ClipboardPaste, PenLine, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Link } from '@/i18n/navigation';
import { spring } from '@/lib/motion';
import { PasteNoteSheet } from './paste-note-sheet';

const optionClass =
  'flex w-full items-center gap-3 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-2';

/** «Добавить песню» that springs open into the ways to add one. */
export function CreateSongMenu() {
  const t = useTranslations('songs');
  const [open, setOpen] = useState(false);
  const [pasting, setPasting] = useState(false);

  const options = [
    {
      key: 'write',
      icon: PenLine,
      tone: 'bg-brand-2/15 text-brand-2',
      title: t('write'),
      hint: t('writeHint'),
    },
    {
      key: 'paste',
      icon: ClipboardPaste,
      tone: 'bg-chord/15 text-chord',
      title: t('paste'),
      hint: t('pasteHint'),
    },
  ];

  return (
    <div className="rounded-3xl border border-primary/30 bg-linear-to-br from-primary/12 to-brand-2/5 p-1.5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 rounded-[20px] p-1.5 text-left"
      >
        <motion.span
          animate={{ rotate: open ? 135 : 0 }}
          transition={spring.pop}
          className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow"
        >
          <Plus className="size-5" />
        </motion.span>
        <span>
          <span className="block font-semibold">{t('add')}</span>
          <span className="text-muted-foreground text-xs">{t('addHint')}</span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={spring.soft}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5 px-0.5 pt-1.5 pb-0.5">
              {options.map((option, index) => {
                const Icon = option.icon;
                const body = (
                  <>
                    <span
                      className={`flex size-9 items-center justify-center rounded-xl ${option.tone}`}
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-sm">{option.title}</span>
                      <span className="block truncate text-muted-foreground text-xs">
                        {option.hint}
                      </span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </>
                );
                return (
                  <motion.div
                    key={option.key}
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ ...spring.pop, delay: index * 0.06 }}
                  >
                    {option.key === 'write' ? (
                      <Link href="/songs/new" className={optionClass}>
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        className={optionClass}
                        onClick={() => setPasting(true)}
                      >
                        {body}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <PasteNoteSheet open={pasting} onOpenChange={setPasting} />
    </div>
  );
}
