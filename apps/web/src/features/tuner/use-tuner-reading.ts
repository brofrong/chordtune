'use client';

import type { Tuning } from '@chordtune/audio';
import { type MotionValue, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

import type { FrameStore } from './frame-store';
import { computeReading, IN_TUNE_CENTS, type TuneZone, tuneZone } from './reading';

const STALE_AFTER_MS = 900;
const TUNED_AFTER_MS = 600;

export type ReadingView = {
  noteName: string | null;
  octave: number | null;
  targetIndex: number | null;
  targetLabel: string | null;
  zone: TuneZone | null;
  direction: 'up' | 'down' | null;
  stale: boolean;
};

const EMPTY_VIEW: ReadingView = {
  noteName: null,
  octave: null,
  targetIndex: null,
  targetLabel: null,
  zone: null,
  direction: null,
  stale: true,
};

export type TunerReading = {
  view: ReadingView;
  cents: MotionValue<number>;
  frequency: MotionValue<number>;
  level: MotionValue<number>;
  tuned: ReadonlySet<number>;
};

function sameView(a: ReadingView, b: ReadingView): boolean {
  return (
    a.noteName === b.noteName &&
    a.octave === b.octave &&
    a.targetIndex === b.targetIndex &&
    a.targetLabel === b.targetLabel &&
    a.zone === b.zone &&
    a.direction === b.direction &&
    a.stale === b.stale
  );
}

/**
 * Turns raw frames into what the screen shows. Continuous values (needle, Hz, level) go through
 * motion values; React state only changes when a discrete part of the reading does.
 */
export function useTunerReading(
  store: FrameStore,
  tuning: Tuning,
  lockedIndex: number | null,
  a4: number,
): TunerReading {
  const cents = useSpring(0, { stiffness: 260, damping: 28, mass: 0.7 });
  const frequency = useMotionValue(0);
  const level = useSpring(0, { stiffness: 400, damping: 40 });
  const [view, setView] = useState<ReadingView>(EMPTY_VIEW);
  const [tuned, setTuned] = useState<ReadonlySet<number>>(() => new Set());
  const viewRef = useRef(EMPTY_VIEW);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new tuning starts a fresh session
  useEffect(() => {
    setTuned(new Set());
  }, [tuning]);

  useEffect(() => {
    let lastVoicedAt = 0;
    let inTuneSince: number | null = null;
    let inTuneIndex: number | null = null;
    let staleTimer: ReturnType<typeof setTimeout> | null = null;

    const publish = (next: ReadingView) => {
      if (!sameView(viewRef.current, next)) {
        viewRef.current = next;
        setView(next);
      }
    };

    const markStale = () => {
      if (!viewRef.current.stale) {
        publish({ ...viewRef.current, stale: true });
      }
    };

    const unsubscribe = store.subscribe((frame) => {
      const now = performance.now();
      level.set(Math.min(1, Math.sqrt(frame.level) * 4));
      const reading = computeReading(frame, tuning, lockedIndex, a4);

      if (reading == null) {
        inTuneSince = null;
        if (now - lastVoicedAt > STALE_AFTER_MS) {
          markStale();
        }
        return;
      }

      lastVoicedAt = now;
      if (staleTimer) {
        clearTimeout(staleTimer);
      }
      staleTimer = setTimeout(markStale, STALE_AFTER_MS);

      cents.set(reading.cents);
      frequency.set(reading.frequency);

      const inTune = Math.abs(reading.cents) <= IN_TUNE_CENTS && reading.targetIndex != null;
      if (inTune && inTuneIndex === reading.targetIndex) {
        inTuneSince ??= now;
        const index = reading.targetIndex;
        if (index != null && now - inTuneSince >= TUNED_AFTER_MS) {
          setTuned((current) => (current.has(index) ? current : new Set(current).add(index)));
        }
      } else {
        inTuneSince = inTune ? now : null;
        inTuneIndex = reading.targetIndex;
      }

      const zone = tuneZone(reading.cents);
      publish({
        noteName: reading.note.name,
        octave: reading.note.octave,
        targetIndex: reading.targetIndex,
        targetLabel: reading.targetLabel,
        zone,
        direction: zone === 'in' ? null : reading.cents < 0 ? 'up' : 'down',
        stale: false,
      });
    });

    return () => {
      unsubscribe();
      if (staleTimer) {
        clearTimeout(staleTimer);
      }
    };
  }, [store, tuning, lockedIndex, a4, cents, frequency, level]);

  return { view, cents, frequency, level, tuned };
}
