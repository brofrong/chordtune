'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useTRPC } from '@/lib/trpc';
import { ProfileView } from './profile-view';

/** User page of the static Capacitor build: `/u?name=…`. */
export function ProfileByQuery() {
  const t = useTranslations('profile');
  const trpc = useTRPC();
  const name = useSearchParams().get('name') ?? '';
  const profile = useQuery({
    ...trpc.profile.byUsername.queryOptions({ username: name }),
    enabled: Boolean(name),
  });
  if (profile.isError || !name) {
    return <p className="p-8 text-center text-muted-foreground">{t('notFound')}</p>;
  }
  if (profile.isPending) {
    return <p className="p-8 text-center text-muted-foreground">{t('loading')}</p>;
  }
  return <ProfileView profile={profile.data} />;
}
