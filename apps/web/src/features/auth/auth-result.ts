import { authErrorKey } from './auth-errors';

type Failure = { code?: string; status?: number; message?: string };

/** A failed Better Auth call, thrown so React Query sees an error rather than an empty list. */
export class AuthRequestError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(failure: Failure) {
    super(failure.message || failure.code || 'Auth request failed');
    this.code = failure.code;
    this.status = failure.status;
  }
}

/** The client resolves to `{ data, error }` instead of throwing; this throws the error. */
export async function unwrap<T>(
  request: Promise<{ data: T | null; error: Failure | null }>,
): Promise<T> {
  const { data, error } = await request;
  if (error || data === null) {
    throw new AuthRequestError(error ?? {});
  }
  return data;
}

/** The session is too old for this action: only signing in again helps. */
export function isReauthError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && authErrorKey(error as Failure) === 'reauth';
}

/** React Query's default three retries, but none for an error that retrying can't fix. */
export function retryUnlessReauth(failureCount: number, error: unknown): boolean {
  return !isReauthError(error) && failureCount < 3;
}
