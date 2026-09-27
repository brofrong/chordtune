'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useSession } from '@/features/auth/use-session';
import { isNetworkError } from '@/features/song/play-route';
import { useOnline } from '@/lib/network';
import { useTRPCClient } from '@/lib/trpc';
import { flushQueue, reconcileOffline } from './offline-store';

export const OFFLINE_SONGS_KEY = ['offline-songs'];

function isUnauthorized(error: unknown): boolean {
  return (error as { data?: { code?: string } } | null)?.data?.code === 'UNAUTHORIZED';
}

/**
 * Whenever the app starts or the connection comes back: send plays queued offline, then make
 * the saved songs on this device match the account (download new, drop unsaved).
 */
export function OfflineSync() {
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const online = useOnline();
  const userId = useSession().data?.user.id;

  useEffect(() => {
    if (!online || !userId) {
      return;
    }
    let cancelled = false;
    // A song the server rejects (deleted, gone private) is dropped from the queue; network
    // failures keep it. The saved list syncs regardless of how the queue went.
    void flushQueue(
      async (id, times) => {
        await client.arrangements.played.mutate({ id, times });
      },
      { drop: (error) => !isNetworkError(error) && !isUnauthorized(error) },
    );
    client.library.saved
      .query()
      .then(async (saved) => {
        if (!cancelled) {
          await reconcileOffline(saved);
          await queryClient.invalidateQueries({ queryKey: OFFLINE_SONGS_KEY });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [online, userId, client, queryClient]);

  return null;
}
