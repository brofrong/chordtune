import { AsyncLocalStorage } from 'node:async_hooks';

type Store = { failed: boolean };

const storage = new AsyncLocalStorage<Store>();

/**
 * Better Auth 1.7 awaits the OTP send callback but only logs a thrown error instead of
 * rethrowing it (`runInBackgroundOrAwait`), so a mailer failure never reaches the client on
 * its own. Running the auth handler inside this store lets `markMailFailed` flag the failure
 * from inside that callback, so it can be turned into a distinct response here.
 */
export async function withMailFailure(run: () => Promise<Response>): Promise<Response> {
  const store: Store = { failed: false };
  const response = await storage.run(store, run);
  if (store.failed) {
    return Response.json({ code: 'MAIL_FAILED', message: 'Mail failed' }, { status: 503 });
  }
  return response;
}

/** Flags the current request's mailer as having failed; returns whether a store was active. */
export function markMailFailed(): boolean {
  const store = storage.getStore();
  if (!store) {
    return false;
  }
  store.failed = true;
  return true;
}
