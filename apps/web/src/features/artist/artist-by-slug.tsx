'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';

import type { Locale } from '@/i18n/routing';
import { useOnline } from '@/lib/network';
import { useTRPC } from '@/lib/trpc';
import { ArtistView } from './artist-view';

/** Artist page of the static Capacitor build: `/artist?slug=…`. */
export function ArtistBySlug() {
  const t = useTranslations('artist');
  const trpc = useTRPC();
  const locale = useLocale() as Locale;
  const online = useOnline();
  const slug = useSearchParams().get('slug') ?? '';
  const query = useQuery({
    ...trpc.artists.bySlug.queryOptions({ slug, locale }),
    enabled: slug !== '' && online,
    retry: false,
  });
  if (query.data) {
    // Keyed by id: the "More" state must reset when `?slug=` switches artists.
    return <ArtistView key={query.data.id} artist={query.data} />;
  }
  const waiting = online && query.isPending;
  return (
    <p className="mx-auto w-full max-w-2xl px-4 py-8 text-muted-foreground">
      {!slug ? t('notFound') : waiting ? t('loading') : online ? t('notFound') : t('noNetwork')}
    </p>
  );
}
