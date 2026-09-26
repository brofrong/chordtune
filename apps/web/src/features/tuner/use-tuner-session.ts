'use client';

import type { AnalyzerSettings } from '@chordtune/audio';
import {
  startTunerSession,
  TunerError,
  type TunerErrorCode,
  type TunerSession,
} from '@chordtune/audio/browser';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FrameStore } from './frame-store';

export type TunerStatus = 'idle' | 'starting' | 'listening' | 'error';

export function useTunerSession(settings: AnalyzerSettings) {
  const [store] = useState(() => new FrameStore());
  const [status, setStatus] = useState<TunerStatus>('idle');
  const [error, setError] = useState<TunerErrorCode | null>(null);
  const sessionRef = useRef<TunerSession | null>(null);
  const settingsRef = useRef(settings);
  // Bumped by stop() so a start() that is still awaiting the permission prompt gets discarded.
  const generationRef = useRef(0);

  const { a4, minHz, maxHz, debug } = settings;
  useEffect(() => {
    const next = { a4, minHz, maxHz, debug };
    settingsRef.current = next;
    sessionRef.current?.update(next);
  }, [a4, minHz, maxHz, debug]);

  const stop = useCallback(() => {
    generationRef.current += 1;
    sessionRef.current?.stop();
    sessionRef.current = null;
    setStatus('idle');
  }, []);

  const start = useCallback(async () => {
    if (sessionRef.current) {
      return;
    }
    const generation = ++generationRef.current;
    setStatus('starting');
    setError(null);
    try {
      const session = await startTunerSession({
        settings: settingsRef.current,
        onFrame: (frame) => store.push(frame),
      });
      if (generation !== generationRef.current) {
        session.stop();
        return;
      }
      sessionRef.current = session;
      setStatus('listening');
    } catch (caught) {
      if (generation !== generationRef.current) {
        return;
      }
      setError(caught instanceof TunerError ? caught.code : 'unknown');
      setStatus('error');
    }
  }, [store]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [stop]);

  return { store, status, error, start, stop };
}
