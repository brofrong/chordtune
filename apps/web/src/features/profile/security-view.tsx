'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { authErrorKey } from '@/features/auth/auth-errors';
import { accountsQuery, passkeysQuery, sessionsQuery } from '@/features/auth/auth-queries';
import { isReauthError } from '@/features/auth/auth-result';
import { useAuthSheet } from '@/features/auth/auth-sheet';
import { takeOAuthError } from '@/features/auth/oauth-error';
import { isPlaceholderEmail } from '@/features/auth/placeholder-email';
import { useSession } from '@/features/auth/use-session';
import { DeleteAccountSection } from './delete-account-section';
import { EmailSection } from './email-section';
import { PasskeysSection } from './passkeys-section';
import { ProvidersSection } from './providers-section';
import { type SecurityFailure, SecurityReportProvider } from './security-report';
import { SessionsSection } from './sessions-section';

export function SecurityView() {
  const t = useTranslations('security');
  const tProfile = useTranslations('profile');
  const tAuth = useTranslations('auth');
  const toast = useToast();
  const session = useSession();
  const openAuth = useAuthSheet();
  const user = session.data?.user;
  const sessionId = session.data?.session.id;
  // The session an action found too old. Signing in again makes a new session, which clears it.
  const [staleSession, setStaleSession] = useState<string | null>(null);

  const accounts = useQuery({ ...accountsQuery, enabled: Boolean(user) });
  const passkeys = useQuery({ ...passkeysQuery, enabled: Boolean(user) });
  // Listed by its own section; read here too so an old session shows the one block below.
  const sessions = useQuery({ ...sessionsQuery, enabled: Boolean(user) });

  // Linking a service on the web comes back here with `?error=…` when it fails.
  useEffect(() => {
    const oauthError = takeOAuthError();
    if (oauthError) {
      toast(tAuth(`errors.${authErrorKey(oauthError)}`), 'error');
    }
  }, [toast, tAuth]);

  useEffect(() => {
    if (!session.isPending && !user) {
      openAuth();
    }
  }, [openAuth, session.isPending, user]);

  const report = useCallback(
    (error: SecurityFailure) => {
      if (!error) {
        return;
      }
      if (isReauthError(error)) {
        setStaleSession(sessionId ?? null);
        return;
      }
      toast(tAuth(`errors.${authErrorKey(error)}`), 'error');
    },
    [sessionId, toast, tAuth],
  );

  if (!user) {
    return null;
  }
  const needsReauth =
    (staleSession !== null && staleSession === sessionId) ||
    [accounts.error, passkeys.error, sessions.error].some(isReauthError);
  if (needsReauth) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6">
        <h1 className="font-display font-semibold text-xl">{t('title')}</h1>
        <div className="flex flex-col items-start gap-3 rounded-xl border border-border p-4">
          <p>{t('reauthManage')}</p>
          <Button onClick={() => openAuth()}>{tAuth('signIn')}</Button>
        </div>
      </div>
    );
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
    <SecurityReportProvider value={report}>
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
    </SecurityReportProvider>
  );
}
