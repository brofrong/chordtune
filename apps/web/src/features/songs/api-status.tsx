'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';

export function ApiStatus() {
  const t = useTranslations('songs');
  const trpc = useTRPC();
  const health = useQuery({ ...trpc.health.queryOptions(), retry: false });
  const online = health.data?.ok === true;

  return (
    <p className="flex items-center gap-2 text-muted-foreground text-xs">
      <span
        className={cn(
          'size-2 rounded-full',
          health.isPending ? 'bg-muted-foreground' : online ? 'bg-tune-in' : 'bg-tune-off',
        )}
      />
      {health.isPending ? t('apiChecking') : online ? t('apiOnline') : t('apiOffline')}
    </p>
  );
}
