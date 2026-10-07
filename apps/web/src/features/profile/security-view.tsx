'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { useAuthSheet } from '@/features/auth/auth-sheet';
import { isPlaceholderEmail } from '@/features/auth/placeholder-email';
import { useSession } from '@/features/auth/use-session';
import { authClient } from '@/lib/auth-client';
import { DeleteAccountSection } from './delete-account-section';
import { EmailSection } from './email-section';
import { PasskeysSection } from './passkeys-section';
import { ProvidersSection } from './providers-section';
import { SessionsSection } from './sessions-section';

export function SecurityView() {
  const t = useTranslations('security');
  const tProfile = useTranslations('profile');
  const session = useSession();
  const openAuth = useAuthSheet();
  const user = session.data?.user;

  const accounts = useQuery({
    queryKey: ['auth', 'accounts'],
    queryFn: async () => (await authClient.listAccounts()).data ?? [],
    enabled: Boolean(user),
  });
  const passkeys = useQuery({
    queryKey: ['auth', 'passkeys'],
    queryFn: async () => (await authClient.passkey.listUserPasskeys()).data ?? [],
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!session.isPending && !user) {
      openAuth();
    }
  }, [openAuth, session.isPending, user]);

  if (!user) {
    return null;
  }
  if (accounts.isError || passkeys.isError) {
    return <p className="p-8 text-center text-muted-foreground">{tProfile('loadFailed')}</p>;
  }
  if (accounts.isPending || passkeys.isPending) {
    return <p className="p-8 text-center text-muted-foreground">{tProfile('loading')}</p>;
  }

  const providers = accounts.data.filter((account) => account.providerId !== 'credential');
  const hasEmail = user.emailVerified && !isPlaceholderEmail(user.email);
  const methodCount = providers.length + passkeys.data.length + (hasEmail ? 1 : 0);
  // The server re-checks this itself (Task 7) — this is only so the button doesn't invite a
  // guaranteed-to-fail attempt.
  const canRemove = methodCount > 1;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6">
      <h1 className="font-display font-semibold text-xl">{t('title')}</h1>
      <EmailSection email={hasEmail ? user.email : null} />
      <ProvidersSection
        linked={providers.map((account) => ({ id: account.id, providerId: account.providerId }))}
        canRemove={canRemove}
      />
      <PasskeysSection passkeys={passkeys.data} canRemove={canRemove} />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
}
