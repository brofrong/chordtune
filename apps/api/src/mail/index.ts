import nodemailer from 'nodemailer';

export type Mail = { to: string; subject: string; text: string };
export type Mailer = (mail: Mail) => Promise<void>;

/** SMTP when configured; otherwise the message goes to the log, which is enough for local work. */
export function createMailer({ smtpUrl, from }: { smtpUrl?: string; from: string }): Mailer {
  if (!smtpUrl) {
    return async (mail) => {
      console.info(`[mail] to ${mail.to}: ${mail.subject}\n${mail.text}`);
    };
  }
  const transport = nodemailer.createTransport(smtpUrl);
  return async (mail) => {
    await transport.sendMail({ from, ...mail });
  };
}
