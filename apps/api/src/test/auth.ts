import type { AuthConfig } from '../auth/config';
import { createAuth } from '../auth/create-auth';
import type { Mail } from '../mail';
import { createTestDb } from './db';

const DEFAULT_CONFIG: AuthConfig = {
  passkey: { rpID: 'localhost', origins: ['http://localhost:3000'], ios: false, android: false },
};

/** Better Auth on a fresh PGlite database; mail lands in `sent` instead of SMTP. */
export async function createTestAuth(config: Partial<AuthConfig> = {}) {
  const db = await createTestDb();
  const sent: Mail[] = [];
  const auth = createAuth({
    db,
    secret: 'test-secret-that-is-long-enough-for-better-auth',
    baseURL: 'http://localhost:4000',
    trustedOrigins: ['http://localhost:3000'],
    config: { ...DEFAULT_CONFIG, ...config },
    mailer: async (mail) => {
      sent.push(mail);
    },
  });

  const lastCode = () => {
    const code = sent.at(-1)?.text.match(/\d{6}/)?.[0];
    if (!code) {
      throw new Error('No code was mailed');
    }
    return code;
  };

  /** Signs in by email code and returns what a client would keep. */
  const signIn = async (email: string) => {
    await auth.api.sendVerificationOTP({ body: { email, type: 'sign-in' } });
    const result = await auth.api.signInEmailOTP({ body: { email, otp: lastCode() } });
    return {
      token: result.token,
      userId: result.user.id,
      headers: new Headers({ Authorization: `Bearer ${result.token}` }),
    };
  };

  return { db, auth, sent, lastCode, signIn };
}
