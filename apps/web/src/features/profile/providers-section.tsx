'use client';

import type { ProviderId } from '@chordtune/api';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { authErrorKey } from '@/features/auth/auth-errors';
import { startNativeSignIn } from '@/features/auth/native-sign-in';
import { linkTelegram } from '@/features/auth/telegram-login';
import { useAuthMethods } from '@/features/auth/use-auth-methods';
import { isCapacitor } from '@/features/song/links';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';

type LinkedAccount = { id: string; providerId: string };
type LinkResult = { error?: { code?: string } | null } | undefined;

async function link(provider: ProviderId, telegramBot: string | undefined): Promise<LinkResult> {
  if (isCapacitor) {
    try {
      // The result comes back by deep link; NativeAuthLinks refreshes the queries. A thrown
      // error here only means the app couldn't get a one-time token to hand the browser.
      await startNativeSignIn({ provider, mode: 'link' });
    } catch {
      return { error: { code: 'FAILED' } };
    }
    return undefined;
  }
  const callbackURL = window.location.href;
  if (provider === 'telegram') {
    return telegramBot ? linkTelegram(telegramBot) : undefined;
  }
  return authClient.linkSocial({ provider, callbackURL });
}

export function ProvidersSection({
  linked,
  canRemove,
}: {
  linked: LinkedAccount[];
  canRemove: boolean;
}) {
  const t = useTranslations('security');
  const tAuth = useTranslations('auth');
  const toast = useToast();
  const methods = useAuthMethods();
  const queryClient = useQueryClient();
  const providers = methods.data?.providers ?? [];
  if (providers.length === 0) {
    return null;
  }
  const report = (result: LinkResult) => {
    if (result?.error) {
      toast(tAuth(`errors.${authErrorKey(result.error)}`), 'error');
    }
  };
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['auth', 'accounts'] });

  return (
    <Section title={t('services')}>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {providers.map((provider) => {
          const account = linked.find((item) => item.providerId === provider);
          return (
            <li key={provider} className="flex items-center justify-between p-3">
              <span>{tAuth(`providers.${provider}`)}</span>
              {account ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canRemove}
                  title={canRemove ? undefined : t('lastMethodHint')}
                  onClick={async () => {
                    report(await authClient.unlinkAccount({ accountId: account.id }));
                    await refresh();
                  }}
                >
                  {t('unlink')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    report(await link(provider, methods.data?.telegramBot?.id));
                    await refresh();
                  }}
                >
                  {t('link')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
