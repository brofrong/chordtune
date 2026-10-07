'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { authErrorKey } from '@/features/auth/auth-errors';
import { addPasskey, passkeySupported } from '@/features/auth/passkeys';
import { useAuthMethods } from '@/features/auth/use-auth-methods';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';
import { describeUserAgent } from './user-agent';

type Passkey = { id: string; name?: string | null; createdAt: Date | string };

export function PasskeysSection({
  passkeys,
  canRemove,
}: {
  passkeys: Passkey[];
  canRemove: boolean;
}) {
  const t = useTranslations('security');
  const tAuth = useTranslations('auth');
  const format = useFormatter();
  const toast = useToast();
  const methods = useAuthMethods();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['auth', 'passkeys'] });
  // `undefined` means the user cancelled the system sheet — silent, not an error.
  const report = (error: { code?: string } | null | undefined) =>
    error && toast(tAuth(`errors.${authErrorKey(error)}`), 'error');

  return (
    <Section title={t('passkeys')}>
      {passkeys.length === 0 && <p className="text-muted-foreground text-sm">{t('noPasskeys')}</p>}
      <ul className="flex flex-col gap-2">
        {passkeys.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <KeyRound className="size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{item.name || t('passkeyDefaultName')}</span>
              <span className="text-muted-foreground text-xs">
                {format.dateTime(new Date(item.createdAt), { dateStyle: 'medium' })}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canRemove}
              title={canRemove ? undefined : t('lastMethodHint')}
              onClick={async () => {
                const result = await authClient.passkey.deletePasskey({ id: item.id });
                report(result.error);
                await refresh();
              }}
            >
              {t('delete')}
            </Button>
          </li>
        ))}
      </ul>
      {passkeySupported(methods.data) && (
        <Button
          variant="outline"
          className="self-start"
          onClick={async () => {
            const result = await addPasskey(describeUserAgent(navigator.userAgent).os ?? undefined);
            report(result?.error);
            await refresh();
          }}
        >
          {t('addPasskey')}
        </Button>
      )}
    </Section>
  );
}
