'use client';

import { Eye, PenLine, TextCursorInput } from 'lucide-react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { spring } from '@/lib/motion';
import { cn } from '@/lib/utils';
import type { EditorMode } from './chord-editor';

const MODES = [
  { id: 'visual', icon: PenLine, label: 'modeVisual' },
  { id: 'text', icon: TextCursorInput, label: 'modeText' },
  { id: 'check', icon: Eye, label: 'modeCheck' },
] as const;

/** Visual / Text / Check at the bottom of the editor, with a sliding highlight. */
export function EditorDock({
  mode,
  onChange,
}: {
  mode: EditorMode;
  onChange: (mode: EditorMode) => void;
}) {
  const t = useTranslations('editor');
  return (
    <motion.nav
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={spring.soft}
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-sm gap-1 rounded-[20px] border border-border bg-popover/90 p-1.5 shadow-lg backdrop-blur-xl md:bottom-6"
    >
      {MODES.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          aria-pressed={mode === id}
          onClick={() => onChange(id)}
          className={cn(
            'relative flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2 font-medium text-muted-foreground text-sm transition-colors',
            mode === id && 'text-foreground',
          )}
        >
          {mode === id && (
            <motion.span
              layoutId="editor-mode"
              transition={spring.soft}
              className="absolute inset-0 rounded-2xl bg-surface-2"
            />
          )}
          <Icon
            className={cn('relative size-4', mode === id && id === 'check' && 'text-primary')}
          />
          <span className="relative">{t(label)}</span>
        </button>
      ))}
    </motion.nav>
  );
}
