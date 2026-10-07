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
import { isCapacitor } from '@/features/song/links';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from './auth-errors';
import { EmailCodeForm } from './email-code-form';
import { isSecurityPath, takeOAuthError } from './oauth-error';
import { signInWithPasskey } from './passkeys';
import { ProviderButtons } from './provider-buttons';
import { openTelegramLogin } from './telegram-login';
import { useAuthMethods } from './use-auth-methods';
import { usePasskeySupport } from './use-passkey-support';
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
  // sheet and say why. The security page reports its own linking errors.
  useEffect(() => {
    if (isSecurityPath(window.location.pathname)) {
      return;
    }
    const oauthError = takeOAuthError();
    if (!oauthError) {
      return;
    }
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
  const passkeys = usePasskeySupport();
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

  // Lets the browser suggest a passkey from the email field's autofill dropdown. Resolves only
  // if the user actually picks one there; runs once per sheet open, not on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per sheet open
  useEffect(() => {
    if (isCapacitor || !window.PublicKeyCredential?.isConditionalMediationAvailable) {
      return;
    }
    let active = true;
    window.PublicKeyCredential.isConditionalMediationAvailable().then(async (available) => {
      if (!available || !active) {
        return;
      }
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (active && result && !result.error) {
        await finish();
      }
    });
    return () => {
      active = false;
    };
  }, []);

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
      {passkeys && (
        <Button variant="outline" size="lg" onClick={() => run(signInWithPasskey)}>
          <KeyRound />
          {t('passkey')}
        </Button>
      )}
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
