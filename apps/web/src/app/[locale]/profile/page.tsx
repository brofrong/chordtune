import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { MyProfile } from '@/features/profile/my-profile';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/profile'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'profile' });
  return { title: t('title') };
}

export default async function ProfilePage({ params }: PageProps<'/[locale]/profile'>) {
  await resolveLocale(params);
  return <MyProfile />;
}
