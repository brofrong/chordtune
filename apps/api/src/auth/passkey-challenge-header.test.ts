import { describe, expect, test } from 'bun:test';

import { createTestAuth } from '../test/auth';

const ORIGIN = 'http://localhost:3000';

function generateAuthOptions() {
  return new Request('http://localhost:4000/api/auth/passkey/generate-authenticate-options', {
    method: 'GET',
    headers: { origin: ORIGIN },
  });
}

function verifyAuthRequest(headers: Record<string, string> = {}) {
  return new Request('http://localhost:4000/api/auth/passkey/verify-authentication', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...headers },
    body: JSON.stringify({ response: { id: 'nonexistent-credential-id' } }),
  });
}

describe('passkeyChallengeHeader', () => {
  test('relays the challenge cookie through a header, no cookie jar involved', async () => {
    const { auth } = await createTestAuth();

    const generated = await auth.handler(generateAuthOptions());
    const challenge = generated.headers.get('x-passkey-challenge');
    expect(challenge).toBeTruthy();

    // No `Cookie` header is ever sent here — only the relayed header, the way the Capacitor
    // apps do it — yet the endpoint gets past the challenge lookup (it fails later, on a
    // passkey that does not exist, not on the cookie).
    const verified = await auth.handler(
      verifyAuthRequest({ 'x-passkey-challenge': challenge ?? '' }),
    );
    const body = (await verified.json()) as { code?: string };
    expect(body.code).not.toBe('CHALLENGE_NOT_FOUND');
    expect(body.code).toBe('PASSKEY_NOT_FOUND');
  });

  test('without the header, verify-authentication has no challenge to find', async () => {
    const { auth } = await createTestAuth();

    await auth.handler(generateAuthOptions());
    const verified = await auth.handler(verifyAuthRequest());

    expect(verified.status).toBe(400);
    expect(await verified.json()).toMatchObject({ code: 'CHALLENGE_NOT_FOUND' });
  });
});
