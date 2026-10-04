import { z } from 'zod';

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
});

export const env = schema.parse(process.env);
