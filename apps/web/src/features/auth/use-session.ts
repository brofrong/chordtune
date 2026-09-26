'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { authToken } from '@/lib/api';
import { authClient } from '@/lib/auth-client';

export function useSession() {
  return authClient.useSession();
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const session = useSession();
  return useCallback(async () => {
    await authClient.signOut();
    authToken.set(null);
    await session.refetch();
    await queryClient.invalidateQueries();
  }, [queryClient, session]);
}
