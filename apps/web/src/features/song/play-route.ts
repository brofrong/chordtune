import { TRPCClientError } from '@trpc/client';

export type PlayRoute = 'skip' | 'auth' | 'queue' | 'send';

/**
 * What a play («Сыграл», or finishing zen mode) does: nothing in the editor's preview; offline it
 * is queued if this device has an account (the session can't load without a connection).
 */
export function playRoute({
  preview,
  online,
  signedIn,
  hasToken,
  canQueue,
}: {
  preview: boolean;
  online: boolean;
  signedIn: boolean;
  hasToken: boolean;
  canQueue: boolean;
}): PlayRoute {
  if (preview) {
    return 'skip';
  }
  if (!online) {
    return (signedIn || hasToken) && canQueue ? 'queue' : 'auth';
  }
  return signedIn ? 'send' : 'auth';
}

/** The request never reached the server (as opposed to the server answering with an error). */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof TRPCClientError) {
    return !error.data;
  }
  return error instanceof TypeError;
}
