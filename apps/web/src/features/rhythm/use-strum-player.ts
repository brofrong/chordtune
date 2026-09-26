'use client';

import type { ScheduledNote } from '@chordtune/audio';
import { createStrumPlayer, type StrumPlayer } from '@chordtune/audio/browser';
import { useCallback, useEffect, useRef, useState } from 'react';

type PlayOptions = { loopSec?: number };

/**
 * One player per screen. `play(id, …)` starts playback tagged with `id` (replacing whatever
 * plays), `toggle` stops it instead when that id is already playing. `position` is the
 * playback time in seconds, for highlighting.
 */
export function useStrumPlayer() {
  const player = useRef<StrumPlayer | null>(null);
  const playingRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [position, setPosition] = useState(0);

  const stop = useCallback(() => {
    player.current?.stop();
  }, []);

  const play = useCallback(
    async (id: string, notes: readonly ScheduledNote[], options: PlayOptions = {}) => {
      player.current ??= createStrumPlayer();
      playingRef.current = id;
      setPlaying(id);
      setPosition(0);
      await player.current.play(notes, { ...options, onTick: setPosition });
      if (playingRef.current === id) {
        playingRef.current = null;
        setPlaying(null);
      }
    },
    [],
  );

  const toggle = useCallback(
    (id: string, notes: readonly ScheduledNote[], options: PlayOptions = {}) => {
      if (playingRef.current === id) {
        stop();
        return;
      }
      void play(id, notes, options);
    },
    [play, stop],
  );

  useEffect(() => () => player.current?.stop(), []);

  return { playing, position, play, toggle, stop };
}

export type StrumPlayerControls = ReturnType<typeof useStrumPlayer>;
