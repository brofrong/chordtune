import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ChordsScreen } from '@/features/chords/chords-screen';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/chords'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'chords' });
  return { title: t('pageTitle') };
}

export default async function ChordsPage({ params }: PageProps<'/[locale]/chords'>) {
  await resolveLocale(params);
  return <ChordsScreen />;
}
