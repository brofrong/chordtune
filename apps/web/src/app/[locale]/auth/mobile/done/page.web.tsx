import { notFound } from 'next/navigation';

import { MobileAuthDone } from '@/features/auth/mobile-auth';
import { resolveLocale } from '@/i18n/params';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const PROVIDERS = ['yandex', 'vk', 'telegram', 'google'] as const;

export default async function MobileAuthDonePage({ params, searchParams }: Props) {
  await resolveLocale(params);
  const { provider, state, mode = 'sign-in' } = await searchParams;
  const known = PROVIDERS.find((id) => id === provider);
  if (!known || !state || (mode !== 'sign-in' && mode !== 'link')) {
    notFound();
  }
  return <MobileAuthDone state={state} mode={mode} provider={known} />;
}
