'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import type { SongActionHooks } from '@/features/song/use-song-actions';
import { useOnline } from '@/lib/network';
import { enqueuePlayed, removeOffline, saveOffline } from './offline-store';
import { OFFLINE_SONGS_KEY } from './offline-sync';

/** Saving keeps a copy on the device; plays made offline wait in a queue. */
export function useOfflineHooks(): SongActionHooks {
  const online = useOnline();
  const queryClient = useQueryClient();
  return useMemo(() => {
    const refresh = () => queryClient.invalidateQueries({ queryKey: OFFLINE_SONGS_KEY });
    return {
      online,
      onSaved: (arrangement) => void saveOffline(arrangement).then(refresh),
      onUnsaved: (id) => void removeOffline(id).then(refresh),
      queuePlayed: (id, times) => enqueuePlayed(id, times),
    };
  }, [online, queryClient]);
}
