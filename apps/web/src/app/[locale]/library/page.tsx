import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { LibraryView } from '@/features/library/library-view';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/library'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'library' });
  return { title: t('title') };
}

export default async function LibraryPage({ params }: PageProps<'/[locale]/library'>) {
  await resolveLocale(params);
  return <LibraryView />;
}
