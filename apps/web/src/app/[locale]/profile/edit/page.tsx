import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { ProfileEdit } from '@/features/profile/profile-edit';
import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/profile/edit'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'profile.editForm' });
  return { title: t('title') };
}

export default async function ProfileEditPage({ params }: PageProps<'/[locale]/profile/edit'>) {
  await resolveLocale(params);
  return <ProfileEdit />;
}
