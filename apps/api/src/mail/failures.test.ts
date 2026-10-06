import { describe, expect, test } from 'bun:test';

import { createTestAuth } from '../test/auth';
import { withMailFailure } from './failures';

function sendOTPRequest(email: string) {
  return new Request('http://localhost:4000/api/auth/email-otp/send-verification-otp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ email, type: 'sign-in' }),
  });
}

describe('withMailFailure', () => {
  test('a mailer failure becomes a 503 with the MAIL_FAILED code', async () => {
    const t = await createTestAuth(
      {},
      {
        mailer: async () => {
          throw new Error('SMTP is down');
        },
        // Better Auth logs this failure itself (it only logs, it does not rethrow); silence
        // that log so the induced failure does not clutter this test's output.
        silenceLogger: true,
      },
    );

    const response = await withMailFailure(() =>
      t.auth.handler(sendOTPRequest('fails@test.local')),
    );

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'MAIL_FAILED' });
  });

  test('a successful send passes the original response through', async () => {
    const t = await createTestAuth();

    const response = await withMailFailure(() => t.auth.handler(sendOTPRequest('ok@test.local')));

    expect(response.status).toBe(200);
    expect(t.sent).toHaveLength(1);
  });
});
