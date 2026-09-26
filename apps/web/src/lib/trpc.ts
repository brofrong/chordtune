import type { AppRouter } from '@chordtune/api';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

import { API_URL, authToken } from './api';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ArrangementView = RouterOutputs['arrangements']['byId'];
export type ArrangementListItem = RouterOutputs['songs']['list'][number];

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000 },
    },
  });
}

export function makeTRPCClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${API_URL}/trpc`,
        transformer: superjson,
        headers: () => {
          const token = authToken.get();
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        fetch: (url, init) => fetch(url, { ...init, credentials: 'include' }),
      }),
    ],
  });
}
