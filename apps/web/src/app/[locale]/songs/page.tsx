import { Search } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { Input } from '@/components/ui/input';
import { ApiStatus } from '@/features/songs/api-status';
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
  const t = await getTranslations('songs');

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <h1 className="font-semibold text-2xl tracking-tight">{t('title')}</h1>
      <div className="relative">
        <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground" />
        <Input disabled placeholder={t('searchPlaceholder')} className="h-11 pl-9" />
      </div>
      <p className="text-muted-foreground text-sm leading-relaxed">{t('comingSoon')}</p>
      <ApiStatus />
    </div>
  );
}
