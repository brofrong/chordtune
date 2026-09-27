'use client';

import { useEffect } from 'react';

/** Keeps the screen on while `active`, where the browser supports it. */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) {
      return;
    }
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    navigator.wakeLock
      .request('screen')
      .then((sentinel) => {
        if (cancelled) {
          void sentinel.release();
        } else {
          lock = sentinel;
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      void lock?.release();
    };
  }, [active]);
}
