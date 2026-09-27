'use client';

import { motion, useReducedMotion } from 'motion/react';
import { useEffect } from 'react';

// The first page arrives server-rendered and must be visible before scripts load; only later
// navigations fade in.
let hasNavigated = false;

/** Pages after the first one fade in with a small lift. */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const animate = hasNavigated;
  useEffect(() => {
    hasNavigated = true;
  }, []);
  return (
    <motion.div
      className="flex flex-1 flex-col"
      initial={animate ? { opacity: 0, y: reduced ? 0 : 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
