import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@better-auth/passkey/client';
import { Capacitor } from '@capacitor/core';
import type { CreatePasskeyOptions, GetPasskeyOptions } from '@capawesome/capacitor-passkeys';
import { Passkeys } from '@capawesome/capacitor-passkeys';
import type { AuthMethods } from '@chordtune/api';

import { isCapacitor } from '@/features/song/links';
import { authClient } from '@/lib/auth-client';

// `status` is here only so this structurally overlaps the plain `BetterFetchError` (no `code`)
// that the passkey client can also return on a network/schema failure, not just on API errors.
type Result = { error?: { code?: string; status?: number } | null } | undefined;

/** The WebView's origin is not our domain, so the app goes through the platform's passkey API. */
export function passkeySupported(methods: AuthMethods | undefined) {
  if (!methods) {
    return false;
  }
  if (!isCapacitor) {
    return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
  }
  return Capacitor.getPlatform() === 'ios' ? methods.passkey.ios : methods.passkey.android;
}

/** The plugin's `ErrorCode.Canceled`, or `undefined` for every other platform error code. */
export function nativeErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('code' in err)) {
    return undefined;
  }
  const { code } = err as { code: unknown };
  return typeof code === 'string' ? code : undefined;
}

/**
 * Only a user-cancelled system sheet (`CANCELED`) is silent. Anything else — `NO_CREDENTIAL`,
 * `DOMAIN_NOT_ASSOCIATED` (associated-domains/assetlinks misconfigured), `NOT_SUPPORTED`, a
 * plain native crash — is a real failure and must surface, not be swallowed like a cancel.
 */
export function nativeErrorResult(err: unknown): Result {
  const code = nativeErrorCode(err);
  return code === 'CANCELED' ? undefined : { error: { code: code ?? 'FAILED' } };
}

export async function signInWithPasskey(): Promise<Result> {
  if (!isCapacitor) {
    return authClient.signIn.passkey();
  }
  let challenge: string | null = null;
  const { data: options, error } = await authClient.$fetch<PublicKeyCredentialRequestOptionsJSON>(
    '/passkey/generate-authenticate-options',
    {
      method: 'GET',
      // This WebView's origin can't carry the API's `SameSite=lax` challenge cookie across the
      // cross-site call, so the API hands the signed cookie value back as a header instead
      // (apps/api/src/auth/passkey-challenge-header.ts); relay it on the verify call below.
      onResponse: ({ response }) => {
        challenge = response.headers.get('x-passkey-challenge');
      },
    },
  );
  if (error || !options) {
    return { error: error ?? { code: 'FAILED' } };
  }
  try {
    // The server's WebAuthn JSON and the plugin's field names line up; `transports` just names
    // one more enum member (`cable`) than the plugin's union of string literals does.
    const response = await Passkeys.getPasskey(options as GetPasskeyOptions);
    return authClient.$fetch('/passkey/verify-authentication', {
      method: 'POST',
      body: { response },
      headers: challenge ? { 'x-passkey-challenge': challenge } : undefined,
    });
  } catch (err) {
    return nativeErrorResult(err);
  }
}

export async function addPasskey(name?: string): Promise<Result> {
  if (!isCapacitor) {
    return authClient.passkey.addPasskey({ name });
  }
  let challenge: string | null = null;
  const { data: options, error } = await authClient.$fetch<PublicKeyCredentialCreationOptionsJSON>(
    '/passkey/generate-register-options',
    {
      method: 'GET',
      query: name ? { name } : {},
      onResponse: ({ response }) => {
        challenge = response.headers.get('x-passkey-challenge');
      },
    },
  );
  if (error || !options) {
    return { error: error ?? { code: 'FAILED' } };
  }
  try {
    const response = await Passkeys.createPasskey(options as CreatePasskeyOptions);
    return authClient.$fetch('/passkey/verify-registration', {
      method: 'POST',
      body: { response, name },
      headers: challenge ? { 'x-passkey-challenge': challenge } : undefined,
    });
  } catch (err) {
    return nativeErrorResult(err);
  }
}
