'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { authErrorKey } from '@/features/auth/auth-errors';
import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { useRouter } from '@/i18n/navigation';
import { authToken } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';

export function DeleteAccountSection() {
  const t = useTranslations('security');
  const tAuth = useTranslations('auth');
  const session = useSession();
  const router = useRouter();
  const openAuth = useAuthSheet();
  const [open, setOpen] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A fresh sign-in from the sheet below starts a new session; the user lands back on
  // «Безопасность» and presses delete again, now within the fresh-session window.
  const remove = async () => {
    setError(null);
    const result = await authClient.deleteUser();
    if (result.error) {
      if (authErrorKey(result.error) === 'reauth') {
        setNeedsReauth(true);
      } else {
        setError(tAuth(`errors.${authErrorKey(result.error)}`));
      }
      return;
    }
    authToken.set(null);
    await session.refetch();
    router.push('/');
  };

  return (
    <Section title={t('deleteAccount')}>
      <Button variant="destructive" className="self-start" onClick={() => setOpen(true)}>
        {t('deleteAccount')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-xl sm:mb-8 sm:rounded-xl">
          <div className="flex flex-col gap-4 p-4 pt-0">
            <SheetHeader className="px-0">
              <SheetTitle>{t('deleteAccount')}</SheetTitle>
              <SheetDescription>{needsReauth ? t('reauth') : t('deleteWarning')}</SheetDescription>
            </SheetHeader>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {needsReauth ? (
              <Button
                size="lg"
                onClick={() => {
                  setNeedsReauth(false);
                  setOpen(false);
                  openAuth();
                }}
              >
                {tAuth('signIn')}
              </Button>
            ) : (
              <Button variant="destructive" size="lg" onClick={remove}>
                {t('deleteConfirm')}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Section>
  );
}
