import 'server-only';

import type { AppRouter } from '@chordtune/api';
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import superjson from 'superjson';

import { API_URL } from './api';

/** For server components of the web build; the Capacitor build fetches on the client. */
export const serverTrpc = createTRPCClient<AppRouter>({
  links: [httpBatchLink({ url: `${API_URL}/trpc`, transformer: superjson })],
});
