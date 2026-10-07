import { notFound } from 'next/navigation';

import { MobileAuthStart } from '@/features/auth/mobile-auth';
import { resolveLocale } from '@/i18n/params';
import { serverTrpc } from '@/lib/trpc-server';

// Route types are generated for `page.tsx` only, so the props of this web-only page are typed by hand.
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const PROVIDERS = ['yandex', 'vk', 'telegram', 'google'] as const;

export default async function MobileAuthPage({ params, searchParams }: Props) {
  await resolveLocale(params);
  const { provider, state, mode = 'sign-in', ott = null } = await searchParams;
  const known = PROVIDERS.find((id) => id === provider);
  if (!known || !state || (mode !== 'sign-in' && mode !== 'link')) {
    notFound();
  }
  const methods = await serverTrpc.auth.methods.query();
  return (
    <MobileAuthStart
      provider={known}
      state={state}
      mode={mode}
      ott={ott}
      telegramBot={methods.telegramBot?.id ?? null}
    />
  );
}
