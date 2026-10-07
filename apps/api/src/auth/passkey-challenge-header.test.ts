import { describe, expect, test } from 'bun:test';
import { parseCookies } from 'better-auth/cookies';

import { createTestAuth } from '../test/auth';
import { relayPasskeyChallenge } from './passkey-challenge-header';

const ORIGIN = 'http://localhost:3000';

function generateRequest(path: string, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:4000/api/auth/passkey/${path}`, {
    method: 'GET',
    headers: { origin: ORIGIN, ...headers },
  });
}

function verifyRequest(path: string, body: unknown, headers: Record<string, string> = {}) {
  return new Request(`http://localhost:4000/api/auth/passkey/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: JSON.stringify(body),
  });
}

describe('relayPasskeyChallenge', () => {
  // The bug this guards against only shows up with a bearer session present: bearer()'s own
  // before-hook used to rebuild the `cookie` header from the ORIGINAL request + the session
  // token, discarding whatever a plugin before-hook (the previous, now-removed approach) had
  // spliced in. The apps send a bearer token on every call, so this is the real-world path.
  test('verify-registration with a bearer session gets past the challenge lookup', async () => {
    const { auth, signIn } = await createTestAuth();
    const session = await signIn('passkey-reg@test.local');
    const authHeaders = Object.fromEntries(session.headers);

    const generated = await auth.handler(generateRequest('generate-register-options', authHeaders));
    const challenge = generated.headers.get('x-passkey-challenge');
    expect(challenge).toBeTruthy();

    const relayed = await relayPasskeyChallenge(
      auth,
      verifyRequest(
        'verify-registration',
        { response: { id: 'nonexistent-credential-id' } },
        { ...authHeaders, 'x-passkey-challenge': challenge ?? '' },
      ),
    );
    const verified = await auth.handler(relayed);
    const body = (await verified.json()) as { code?: string };
    expect(body.code).not.toBe('CHALLENGE_NOT_FOUND');
  });

  test('verify-authentication with a bearer session gets past the challenge lookup', async () => {
    const { auth, signIn } = await createTestAuth();
    const session = await signIn('passkey-auth@test.local');
    const authHeaders = Object.fromEntries(session.headers);

    const generated = await auth.handler(
      generateRequest('generate-authenticate-options', authHeaders),
    );
    const challenge = generated.headers.get('x-passkey-challenge');
    expect(challenge).toBeTruthy();

    // No cookie jar anywhere in this test, only the relayed header plus a bearer session — the
    // exact shape of a real Capacitor call.
    const relayed = await relayPasskeyChallenge(
      auth,
      verifyRequest(
        'verify-authentication',
        { response: { id: 'nonexistent-credential-id' } },
        { ...authHeaders, 'x-passkey-challenge': challenge ?? '' },
      ),
    );
    const verified = await auth.handler(relayed);
    const body = (await verified.json()) as { code?: string };
    expect(body.code).not.toBe('CHALLENGE_NOT_FOUND');
    expect(body.code).toBe('PASSKEY_NOT_FOUND');
  });

  test('without the header, verify-authentication has no challenge to find', async () => {
    const { auth } = await createTestAuth();

    await auth.handler(generateRequest('generate-authenticate-options'));
    const relayed = await relayPasskeyChallenge(
      auth,
      verifyRequest('verify-authentication', { response: { id: 'nonexistent-credential-id' } }),
    );
    const verified = await auth.handler(relayed);

    expect(verified.status).toBe(400);
    expect(await verified.json()).toMatchObject({ code: 'CHALLENGE_NOT_FOUND' });
  });

  test('a header value smuggling a second cookie only ever produces one cookie', async () => {
    const { auth } = await createTestAuth();
    const malicious = 'signed.value; better-auth.session_token=evil';

    const relayed = await relayPasskeyChallenge(
      auth,
      verifyRequest(
        'verify-authentication',
        { response: {} },
        { 'x-passkey-challenge': malicious },
      ),
    );

    const ctx = await auth.$context;
    const challengeCookieName = ctx.createAuthCookie('better-auth-passkey').name;
    const names = [...parseCookies(relayed.headers.get('cookie') ?? '').keys()];
    expect(names).toEqual([challengeCookieName]);
    expect(names).not.toContain('better-auth.session_token');
  });
});
