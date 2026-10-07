'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { useTRPC } from '@/lib/trpc';
import { ProfileView } from './profile-view';

export function MyProfile() {
  const t = useTranslations('profile');
  const trpc = useTRPC();
  const session = useSession();
  const openAuth = useAuthSheet();
  const signedIn = Boolean(session.data?.user);
  const profile = useQuery({ ...trpc.profile.me.queryOptions(), enabled: signedIn });

  useEffect(() => {
    if (!session.isPending && !signedIn) {
      openAuth();
    }
  }, [openAuth, session.isPending, signedIn]);

  if (!signedIn) {
    return null;
  }
  if (profile.isError) {
    return <p className="p-8 text-center text-muted-foreground">{t('loadFailed')}</p>;
  }
  if (profile.isPending) {
    return <p className="p-8 text-center text-muted-foreground">{t('loading')}</p>;
  }
  return <ProfileView profile={profile.data} />;
}
