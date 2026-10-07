'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/use-session';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';
import { describeUserAgent } from './user-agent';

export function SessionsSection() {
  const t = useTranslations('security');
  const tProfile = useTranslations('profile');
  const format = useFormatter();
  const session = useSession();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => (await authClient.listSessions()).data ?? [],
  });
  const current = session.data?.session.token;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });

  return (
    <Section title={t('sessions')}>
      {sessions.isPending ? (
        <p className="text-muted-foreground text-sm">{tProfile('loading')}</p>
      ) : sessions.isError ? (
        <p className="text-muted-foreground text-sm">{tProfile('loadFailed')}</p>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {sessions.data.map((item) => {
              const device = describeUserAgent(item.userAgent);
              const label =
                [device.browser, device.os].filter(Boolean).join(' · ') || t('unknownDevice');
              return (
                <li key={item.id} className="flex items-center gap-3 p-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{label}</span>
                    <span className="text-muted-foreground text-xs">
                      {[
                        item.ipAddress,
                        t('lastActive', { date: format.relativeTime(item.updatedAt) }),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                  {item.token === current ? (
                    <Badge variant="secondary">{t('thisDevice')}</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={async () => {
                        await authClient.revokeSession({ token: item.token });
                        await refresh();
                      }}
                    >
                      {t('revoke')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {sessions.data.length > 1 && (
            <Button
              variant="outline"
              className="self-start"
              onClick={async () => {
                await authClient.revokeOtherSessions();
                await refresh();
              }}
            >
              {t('revokeOthers')}
            </Button>
          )}
        </>
      )}
    </Section>
  );
}
