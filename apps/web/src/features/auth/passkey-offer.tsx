'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { authErrorKey } from '@/features/auth/auth-errors';
import { passkeysQuery } from './auth-queries';
import { passkeyOfferStore, shouldOfferPasskey } from './passkey-offer-state';
import { addPasskey } from './passkeys';
import { usePasskeySupport } from './use-passkey-support';
import { useSession } from './use-session';

/** A one-time nudge after sign-in; closing it means never again on this device. */
export function PasskeyOffer() {
  const t = useTranslations('auth.passkeyOffer');
  const tAuth = useTranslations('auth');
  const toast = useToast();
  const session = useSession();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(() => passkeyOfferStore.dismissed());
  const signedIn = Boolean(session.data?.user);
  const supported = usePasskeySupport();
  const passkeys = useQuery({
    ...passkeysQuery,
    enabled: signedIn && !dismissed && supported,
  });

  if (
    !shouldOfferPasskey({
      signedIn,
      supported,
      passkeyCount: passkeys.data?.length,
      dismissed,
    })
  ) {
    return null;
  }
  const close = () => {
    passkeyOfferStore.dismiss();
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-popover p-4 shadow-lg md:bottom-6">
      <KeyRound className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <p className="font-medium">{t('title')}</p>
        <p className="text-muted-foreground text-sm">{t('text')}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              const result = await addPasskey();
              if (result && !result.error) {
                await queryClient.invalidateQueries({ queryKey: passkeysQuery.queryKey });
                close();
              } else if (result?.error) {
                toast(tAuth(`errors.${authErrorKey(result.error)}`), 'error');
              }
            }}
          >
            {t('add')}
          </Button>
          <Button size="sm" variant="ghost" onClick={close}>
            {t('later')}
          </Button>
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={t('later')} onClick={close}>
        <X />
      </Button>
    </div>
  );
}
