'use client';

import { motion } from 'motion/react';

const COUNT = 10;

/** A burst of dots from the centre of the parent; remount (change `key`) to fire again. */
export function Sparks({ className }: { className?: string }) {
  return (
    <span aria-hidden className="pointer-events-none absolute top-1/2 left-[19px]">
      {Array.from({ length: COUNT }, (_, i) => {
        const angle = (Math.PI * 2 * i) / COUNT + (i % 2) * 0.3;
        const distance = 20 + (i % 3) * 6;
        return (
          <motion.span
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed set of dots
            key={i}
            className={`absolute size-1.5 rounded-full ${className ?? 'bg-like'}`}
            style={{ left: -3, top: -3, opacity: i % 3 === 0 ? 0.7 : 1 }}
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance,
              scale: 0.2,
              opacity: 0,
            }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        );
      })}
    </span>
  );
}
