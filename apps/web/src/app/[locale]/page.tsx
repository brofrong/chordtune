import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { TunerScreen } from '@/features/tuner/tuner-screen';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({ params }: PageProps<'/[locale]'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale });
  // The layout's title template only reaches child segments, not this page.
  return { title: { absolute: `${t('tuner.title')} · ${t('app.name')}` } };
}

export default async function TunerPage({ params }: PageProps<'/[locale]'>) {
  await resolveLocale(params);
  return <TunerScreen />;
}
