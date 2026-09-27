'use client';

import { AnimatePresence, motion } from 'motion/react';
import { useRef } from 'react';

import { formatCount } from '@/lib/format';

/** A counter whose digits roll up when it grows and down when it shrinks. */
export function CountRoll({ value }: { value: number }) {
  const previous = useRef(value);
  const direction = value >= previous.current ? 1 : -1;
  previous.current = value;
  return (
    <span className="relative inline-flex h-4 overflow-hidden tabular-nums leading-4">
      <AnimatePresence mode="popLayout" initial={false} custom={direction}>
        <motion.span
          key={value}
          custom={direction}
          initial={{ y: `${direction * 100}%`, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: `${direction * -100}%`, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 26 }}
        >
          {formatCount(value)}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
