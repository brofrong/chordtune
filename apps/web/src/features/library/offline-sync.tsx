'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useSession } from '@/features/auth/use-session';
import { useOnline } from '@/lib/network';
import { useTRPCClient } from '@/lib/trpc';
import { flushQueue, reconcileOffline } from './offline-store';

export const OFFLINE_SONGS_KEY = ['offline-songs'];

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
    (async () => {
      await flushQueue(async (id, times) => {
        await client.arrangements.played.mutate({ id, times });
      });
      const saved = await client.library.saved.query();
      if (!cancelled) {
        await reconcileOffline(saved);
        await queryClient.invalidateQueries({ queryKey: OFFLINE_SONGS_KEY });
      }
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [online, userId, client, queryClient]);

  return null;
}
