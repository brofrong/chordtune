import nodemailer from 'nodemailer';

export type Mail = { to: string; subject: string; text: string };
export type Mailer = (mail: Mail) => Promise<void>;

/**
 * SMTP when configured; otherwise, in development, the message goes to the log. In production a
 * missing SMTP_URL fails the send (the client is told the mail failed) rather than writing
 * sign-in codes to the server log.
 */
export function createMailer({
  smtpUrl,
  from,
  production = false,
}: {
  smtpUrl?: string;
  from: string;
  production?: boolean;
}): Mailer {
  if (!smtpUrl) {
    return async (mail) => {
      if (production) {
        throw new Error('SMTP_URL is not set');
      }
      console.info(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    };
  }
  const transport = nodemailer.createTransport(smtpUrl);
  return async (mail) => {
    await transport.sendMail({ from, ...mail });
  };
}
