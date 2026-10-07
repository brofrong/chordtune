import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { SecurityView } from '@/features/profile/security-view';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/profile/security'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'security' });
  return { title: t('title') };
}

export default async function SecurityPage({ params }: PageProps<'/[locale]/profile/security'>) {
  await resolveLocale(params);
  return <SecurityView />;
}
