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

export async function signInWithPasskey(): Promise<Result> {
  if (!isCapacitor) {
    return authClient.signIn.passkey();
  }
  const { data: options, error } = await authClient.$fetch<PublicKeyCredentialRequestOptionsJSON>(
    '/passkey/generate-authenticate-options',
    { method: 'GET' },
  );
  if (error || !options) {
    return { error };
  }
  try {
    // The server's WebAuthn JSON and the plugin's field names line up; `transports` just names
    // one more enum member (`cable`) than the plugin's union of string literals does.
    const response = await Passkeys.getPasskey(options as GetPasskeyOptions);
    return authClient.$fetch('/passkey/verify-authentication', {
      method: 'POST',
      body: { response },
    });
  } catch {
    return; // the user closed the system sheet, or the platform rejected the request
  }
}

export async function addPasskey(name?: string): Promise<Result> {
  if (!isCapacitor) {
    return authClient.passkey.addPasskey({ name });
  }
  const { data: options, error } = await authClient.$fetch<PublicKeyCredentialCreationOptionsJSON>(
    '/passkey/generate-register-options',
    { method: 'GET', query: name ? { name } : {} },
  );
  if (error || !options) {
    return { error };
  }
  try {
    const response = await Passkeys.createPasskey(options as CreatePasskeyOptions);
    return authClient.$fetch('/passkey/verify-registration', {
      method: 'POST',
      body: { response, name },
    });
  } catch {
    return;
  }
}
