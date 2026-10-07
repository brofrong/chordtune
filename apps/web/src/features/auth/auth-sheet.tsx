'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { authErrorKey } from './auth-errors';
import { EmailCodeForm } from './email-code-form';
import { signInWithPasskey } from './passkeys';
import { ProviderButtons } from './provider-buttons';
import { openTelegramLogin } from './telegram-login';
import { useAuthMethods } from './use-auth-methods';
import { useSession } from './use-session';

const AuthSheetContext = createContext<() => void>(() => {});

/** Opens the sign-in sheet from anywhere, e.g. when saving without an account. */
export function useAuthSheet() {
  return useContext(AuthSheetContext);
}

export function AuthSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = useCallback(() => setOpen(true), []);

  // OAuth comes back with `?error=…` (and sometimes `error_description`) on failure: reopen the
  // sheet and say why.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (!oauthError) {
      return;
    }
    params.delete('error');
    params.delete('error_description');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    setError(oauthError);
    setOpen(true);
  }, []);

  return (
    <AuthSheetContext.Provider value={show}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-xl sm:mb-8 sm:rounded-xl">
          <AuthForm initialError={error} onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </AuthSheetContext.Provider>
  );
}

function AuthForm({ initialError, onDone }: { initialError: string | null; onDone: () => void }) {
  const t = useTranslations('auth');
  const queryClient = useQueryClient();
  const session = useSession();
  const methods = useAuthMethods();
  const [error, setError] = useState(
    initialError ? t(`errors.${authErrorKey(initialError)}`) : null,
  );

  const finish = async () => {
    await session.refetch();
    await queryClient.invalidateQueries();
    onDone();
  };

  const run = async (action: () => Promise<{ error?: { code?: string } | null } | undefined>) => {
    setError(null);
    const result = await action();
    if (result?.error) {
      setError(t(`errors.${authErrorKey(result.error)}`));
      return;
    }
    if (result) {
      await finish();
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      <SheetHeader className="px-0">
        <SheetTitle>{t('title')}</SheetTitle>
        <SheetDescription>{t('description')}</SheetDescription>
      </SheetHeader>
      <ProviderButtons
        onTelegram={() =>
          methods.data?.telegramBot &&
          run(() => openTelegramLogin(methods.data?.telegramBot?.id ?? ''))
        }
      />
      <Button variant="outline" size="lg" onClick={() => run(signInWithPasskey)}>
        <KeyRound />
        {t('passkey')}
      </Button>
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <Separator className="flex-1" />
        {t('orEmail')}
        <Separator className="flex-1" />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <EmailCodeForm onDone={finish} />
    </div>
  );
}
