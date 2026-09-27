import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { resolveLocale } from '@/i18n/params';

export async function generateMetadata({
  params,
}: PageProps<'/[locale]/library'>): Promise<Metadata> {
  const locale = await resolveLocale(params);
  const t = await getTranslations({ locale, namespace: 'app.nav' });
  return { title: t('library') };
}

export default async function LibraryPage({ params }: PageProps<'/[locale]/library'>) {
  await resolveLocale(params);
  const t = await getTranslations('app.nav');
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="font-display font-semibold text-3xl tracking-tight">{t('library')}</h1>
    </div>
  );
}
