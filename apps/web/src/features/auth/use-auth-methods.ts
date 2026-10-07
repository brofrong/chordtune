'use client';

import { useQuery } from '@tanstack/react-query';

import { useTRPC } from '@/lib/trpc';

export function useAuthMethods() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.auth.methods.queryOptions(), staleTime: Number.POSITIVE_INFINITY });
}
