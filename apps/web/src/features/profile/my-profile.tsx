'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { useTRPC } from '@/lib/trpc';
import { ProfileView } from './profile-view';

export function MyProfile() {
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

  return profile.data ? <ProfileView profile={profile.data} /> : null;
}
