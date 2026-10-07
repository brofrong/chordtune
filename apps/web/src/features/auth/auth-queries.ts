import { queryOptions } from '@tanstack/react-query';

import { authClient } from '@/lib/auth-client';
import { retryUnlessReauth, unwrap } from './auth-result';

export const accountsQuery = queryOptions({
  queryKey: ['auth', 'accounts'],
  queryFn: () => unwrap(authClient.listAccounts()),
  retry: retryUnlessReauth,
});

export const passkeysQuery = queryOptions({
  queryKey: ['auth', 'passkeys'],
  queryFn: () => unwrap(authClient.passkey.listUserPasskeys()),
  retry: retryUnlessReauth,
});

export const sessionsQuery = queryOptions({
  queryKey: ['auth', 'sessions'],
  queryFn: () => unwrap(authClient.listSessions()),
  retry: retryUnlessReauth,
});
