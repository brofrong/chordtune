import { authConfig } from './auth/config';
import { createAuth } from './auth/create-auth';
import { authSecret } from './config-store';
import { db } from './db';
import { env } from './env';
import { createMailer } from './mail';

export const auth = createAuth({
  db,
  // Generated on first start and kept in the database, so deployments need no secret in env.
  secret: await authSecret(db),
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: env.WEB_ORIGINS,
  config: authConfig(env),
  mailer: createMailer({ smtpUrl: env.SMTP_URL, from: env.MAIL_FROM }),
});

export type Session = typeof auth.$Infer.Session;
