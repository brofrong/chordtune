'use client';

import { isZenMode, type ZenModeId } from '@chordtune/chord-sheet';
import { useCallback, useEffect, useState } from 'react';

const MAX_CAPO = 12;

/** The listener's choices for one song, kept on this device. `null` means «as the author». */
export type SongSettings = { capo: number | null; zenMode: ZenModeId | null };

const EMPTY: SongSettings = { capo: null, zenMode: null };

export const songSettingsKey = (id: string) => `chordtune.song.${id}`;

export function readSongSettings(raw: string | null): SongSettings {
  if (!raw) {
    return EMPTY;
  }
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      return EMPTY;
    }
    const { capo, zenMode } = data as Record<string, unknown>;
    return {
      capo:
        Number.isInteger(capo) && (capo as number) >= 0 && (capo as number) <= MAX_CAPO
          ? (capo as number)
          : null,
      zenMode: isZenMode(zenMode) ? zenMode : null,
    };
  } catch {
    return EMPTY;
  }
}

/** Starts empty so the prerendered HTML matches, then loads the saved choice. */
export function useSongSettings(id: string) {
  const [settings, setSettings] = useState<SongSettings>(EMPTY);

  useEffect(() => {
    try {
      setSettings(readSongSettings(localStorage.getItem(songSettingsKey(id))));
    } catch {
      setSettings(EMPTY);
    }
  }, [id]);

  const update = useCallback(
    (patch: Partial<SongSettings>) => {
      setSettings((current) => {
        const next = { ...current, ...patch };
        try {
          localStorage.setItem(songSettingsKey(id), JSON.stringify(next));
        } catch {
          // storage can be unavailable in private mode
        }
        return next;
      });
    },
    [id],
  );

  return [settings, update] as const;
}
