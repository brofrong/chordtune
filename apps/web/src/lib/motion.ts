/** Shared springs so every animation in the app moves the same way. */
export const spring = {
  soft: { type: 'spring', stiffness: 300, damping: 30 },
  pop: { type: 'spring', stiffness: 500, damping: 15 },
} as const;
