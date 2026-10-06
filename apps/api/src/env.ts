import { z } from 'zod';

const optional = () =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined);

const schema = z.object({
  DATABASE_URL: z.url(),
  BETTER_AUTH_URL: z.url(),
  API_PORT: z.coerce.number().int().default(4000),
  MEILI_URL: z.url().default('http://localhost:7700'),
  MEILI_KEY: z.string().optional(),
  WEB_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  SMTP_URL: optional(),
  MAIL_FROM: z.string().default('ChordTune <no-reply@localhost>'),
  GOOGLE_CLIENT_ID: optional(),
  GOOGLE_CLIENT_SECRET: optional(),
  YANDEX_CLIENT_ID: optional(),
  YANDEX_CLIENT_SECRET: optional(),
  VK_CLIENT_ID: optional(),
  VK_CLIENT_SECRET: optional(),
  TELEGRAM_BOT_TOKEN: optional(),
  TELEGRAM_BOT_NAME: optional(),
  REVIEW_EMAIL: optional(),
  REVIEW_CODE: optional(),
  APPLE_TEAM_ID: optional(),
  ANDROID_CERT_SHA256: optional(),
});

export const env = schema.parse(process.env);

export type Env = z.infer<typeof schema>;
