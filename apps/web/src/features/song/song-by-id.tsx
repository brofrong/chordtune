'use client';

import { useQuery } from '@tanstack/react-query';
import { CloudOff } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { getOffline, saveOffline } from '@/features/library/offline-store';
import { useOnline } from '@/lib/network';
import { useTRPC } from '@/lib/trpc';
import { SongView } from './song-view';

/**
 * Song page of the static Capacitor build: `/song?id=…`. Shows the copy saved on the device at
 * once, then the fresh one from the server; without a connection the saved copy is enough.
 */
export function SongById() {
  const t = useTranslations('song');
  const trpc = useTRPC();
  const online = useOnline();
  const id = useSearchParams().get('id') ?? '';
  const local = useQuery({
    queryKey: ['offline-song', id],
    queryFn: () => getOffline(id),
    enabled: id !== '',
  });
  const remote = useQuery({
    ...trpc.arrangements.byId.queryOptions({ id }),
    enabled: id !== '' && online,
    retry: false,
  });

  // Keep the saved copy fresh.
  useEffect(() => {
    if (remote.data?.me?.saved) {
      void saveOffline(remote.data);
    }
  }, [remote.data]);

  const arrangement = remote.data ?? local.data;
  if (arrangement) {
    return (
      <>
        {!remote.data && (
          <p className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full bg-surface-2 px-3 py-1 text-muted-foreground text-xs">
            <CloudOff className="size-3.5" />
            {t('offlineBanner')}
          </p>
        )}
        <SongView arrangement={arrangement} />
      </>
    );
  }
  const waiting = local.isPending || (online && remote.isPending);
  return (
    <p className="mx-auto w-full max-w-2xl px-4 py-8 text-muted-foreground">
      {!id ? t('notFound') : waiting ? t('loading') : online ? t('notFound') : t('noNetwork')}
    </p>
  );
}
