import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SongForm } from '@/features/editor/song-form';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/songs/new'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'editor' });
  return { title: t('newTitle') };
}

export default async function NewSongPage({ params }: PageProps<'/[locale]/songs/new'>) {
  await resolveLocale(params);
  return <SongForm />;
}
