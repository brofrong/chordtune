import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SongsBrowser } from '@/features/songs/songs-browser';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/songs'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'songs' });
  return { title: t('title') };
}

export default async function SongsPage({ params }: PageProps<'/[locale]/songs'>) {
  await resolveLocale(params);
  return <SongsBrowser />;
}
