'use client';

import type { ScheduledNote } from '@chordtune/audio';
import { createStrumPlayer, type StrumPlayer } from '@chordtune/audio/browser';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One player per screen. `toggle(id, …)` starts playback tagged with `id`, or stops it if that
 * id is already playing; `position` is the playback time in seconds for highlighting.
 */
export function useStrumPlayer() {
  const player = useRef<StrumPlayer | null>(null);
  const playingRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [position, setPosition] = useState(0);

  const stop = useCallback(() => {
    player.current?.stop();
  }, []);

  const toggle = useCallback(
    async (id: string, notes: readonly ScheduledNote[], options: { loopSec?: number } = {}) => {
      player.current ??= createStrumPlayer();
      if (playingRef.current === id) {
        player.current.stop();
        return;
      }
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

  useEffect(() => () => player.current?.stop(), []);

  return { playing, position, toggle, stop };
}
