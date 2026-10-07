'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { passkeysQuery } from '@/features/auth/auth-queries';
import { addPasskey } from '@/features/auth/passkeys';
import { usePasskeySupport } from '@/features/auth/use-passkey-support';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';
import { useSecurityReport } from './security-report';
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
  const format = useFormatter();
  const report = useSecurityReport();
  const supported = usePasskeySupport();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: passkeysQuery.queryKey });

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
      {supported && (
        <Button
          variant="outline"
          className="self-start"
          onClick={async () => {
            const result = await addPasskey(describeUserAgent(navigator.userAgent).os ?? undefined);
            // `undefined` means the user cancelled the system sheet — silent, not an error.
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
