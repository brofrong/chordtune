'use client';

import { useCallback, useEffect, useState } from 'react';

export const PANEL_KEY = 'chordtune.chords.panel';

export function readPanelOpen(value: string | null): boolean {
  return value !== 'hidden';
}

/** Whether the chord panel is shown: one choice per device, for every song. */
export function useChordPanelOpen() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      setOpen(readPanelOpen(localStorage.getItem(PANEL_KEY)));
    } catch {
      // ignore unreadable storage
    }
  }, []);

  const change = useCallback((next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(PANEL_KEY, next ? 'open' : 'hidden');
    } catch {
      // storage can be unavailable in private mode
    }
  }, []);

  return [open, change] as const;
}
