'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useTRPC } from '@/lib/trpc';
import { SongView } from './song-view';

/** Song page of the static Capacitor build: `/song?id=…`, loaded on the client. */
export function SongById() {
  const t = useTranslations('song');
  const trpc = useTRPC();
  const id = useSearchParams().get('id') ?? '';
  const arrangement = useQuery({
    ...trpc.arrangements.byId.queryOptions({ id }),
    enabled: id !== '',
    retry: false,
  });

  if (arrangement.isSuccess) {
    return <SongView arrangement={arrangement.data} />;
  }
  return (
    <p className="mx-auto w-full max-w-2xl px-4 py-8 text-muted-foreground">
      {arrangement.isError || !id ? t('notFound') : t('loading')}
    </p>
  );
}
