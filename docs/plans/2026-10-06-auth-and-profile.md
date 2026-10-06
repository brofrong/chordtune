# Passwordless sign-in and profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Вход через Яндекс, VK, Google, Telegram, passkey и код на почту вместо пароля — в вебе и
приложениях; ник, публичный профиль, редактирование и экран «Безопасность».

**Architecture:** Better Auth собирается фабрикой `createAuth(deps)` (`apps/api/src/auth/`), чтобы
тесты поднимали его на PGlite с фейковой почтой. Каждый способ входа — плагин или провайдер Better
Auth; Telegram — свой маленький плагин. Приложения входят через системный браузер: веб проводит
OAuth и возвращает одноразовый токен по deep link `app.chordtune://auth`. Профиль — tRPC-роутер
`profile` и страницы `/[locale]/profile*`, `/[locale]/u/*`.

**Tech Stack:** Bun 1.4 (`bun test`), TypeScript 6, Hono + tRPC 11, Better Auth 1.7.6 (+
`@better-auth/passkey` 1.7.6), Drizzle ORM 1.0 RC (relations v2), PGlite в тестах, nodemailer,
Next.js 16 (App Router, React 19, React Compiler), Base UI + shadcn, Tailwind v4, next-intl (ru/en),
Capacitor 8 (`@capacitor/browser`, `@capacitor/app`).

**Spec:** `docs/plans/2026-10-06-auth-and-profile-design.md` — читай вместе с планом.

## Global Constraints

- Better Auth и `@better-auth/passkey` — ровно `1.7.6` (в `apps/web` версия закреплена без `^`).
- Пароля нет: `emailAndPassword` выключен, тексты и поля про пароль удаляются.
- Код на почту: 6 цифр, 300 секунд, 3 попытки.
- Ник: `^[a-z0-9_]{3,30}$`, не из зарезервированного списка.
- Служебный email без почты у провайдера: `tg-<id>@users.invalid`, `vk-<id>@users.invalid`; в UI не показывается, письма на него не уходят.
- Автосклейка аккаунтов по почте — только `google` и `yandex`.
- Провайдер включён, только если заданы его ключи в env; кнопки строятся по `auth.methods`.
- Deep link: схема `app.chordtune`, хост `auth`.
- Адреса страниц: `/<locale>/profile`, `/<locale>/profile/edit`, `/<locale>/profile/security`, `/<locale>/u/<ник>` (веб, SSR), `/<locale>/u?name=<ник>` (Capacitor).
- Все тексты интерфейса — в `apps/web/messages/ru.json` и `en.json`.
- Стиль: Biome (2 пробела, одинарные кавычки, `;`, ширина 100), комментарии редкие и объясняют «почему», как в окружающем коде.
- Код, общий для веба и Capacitor, не использует proxy, route handlers, cookies и заголовки запроса (README). Серверные страницы веба — `page.web.tsx`, route handlers веба — `route.web.ts`.

## Review Focus

1. **Бывший пользователь с паролем первым делом жмёт «Войти через Google» или «Яндекс».** Его локальный `emailVerified` может быть `false`, Better Auth откажет со `account_not_linked`. Человек должен увидеть «Войдите кодом на почту, потом привяжите сервис в профиле», а не «ошибка». Тест на перевод кода ошибки — Task 10 (`auth-errors.test.ts`).
2. **VK без почты или с почтой чужого аккаунта.** Без почты — служебный адрес, вход проходит (Task 5, тест `vkProfileToUser`); с почтой существующего аккаунта — тот же `account_not_linked` и тот же текст (Task 10).
3. **Приложение убито системой, пока пользователь был в браузере.** `state` должен пережить перезапуск (хранится в `localStorage` с временем), просроченный или чужой `state` молча отклоняется. Тесты — Task 12 (`mobile-link.test.ts`).
4. **Код вставили с пробелами или дефисом («123 456», «123-456»).** Поле принимает только цифры, вставка нормализуется. Тест — Task 10 (`otp.test.ts`).
5. **Почта с заглавными буквами** (`Alice@Test.local` при существующем `alice@test.local`) входит в тот же аккаунт. Тест — Task 3.

---

## 0. Прочитай перед началом

- Postgres: `bun run db:up`. Миграции: `cd apps/api && bun run db:generate` (создаёт папку в `apps/api/drizzle/`), API применяет их при старте; тесты — через PGlite (`src/test/db.ts`).
- `bun run auth:generate` (в `apps/api`) перегенерирует `src/db/auth-schema.ts` из конфигурации Better Auth; ему нужен запущенный Postgres и `.env`.
- `apps/web/AGENTS.md`: Next.js 16 отличается от того, что ты помнишь — перед кодом страниц читай `apps/web/node_modules/next/dist/docs/`.
- Если песочница блокирует `bun install` или Docker — попроси пользователя выполнить команду, не обходи песочницу.
- Проверки после каждой задачи: `bun run lint`, `bun run check-types`, `bun run test` в корне.
- Интерфейс пользователь проверяет сам; скриншоты как результат не нужны.

## Карта файлов

API (`apps/api/src`):

- `env.ts` — новые переменные (Task 1).
- `auth/config.ts` — какие способы входа включены, passkey RP/origins (Task 1).
- `auth/placeholder-email.ts` — служебные адреса (Task 1).
- `mail/index.ts`, `mail/otp-message.ts` — отправка и текст письма (Task 2).
- `auth/create-auth.ts` — фабрика Better Auth (Task 3, дополняется в 4–8).
- `auth.ts` — синглтон `auth` из фабрики (Task 3).
- `test/auth.ts` — `createTestAuth()` (Task 3).
- `auth/username.ts` — генерация и проверка ника, backfill (Task 4).
- `auth/providers.ts` — Google, VK, Яндекс (Task 5).
- `auth/telegram.ts`, `auth/telegram-plugin.ts` — проверка подписи и плагин (Task 6).
- `auth/sign-in-methods.ts` — подсчёт способов входа, защита последнего (Task 7).
- `trpc/routers/auth.ts` — `auth.methods` (Task 7).
- `auth/delete-account.ts` — правило свежего входа (Task 8).
- `services/profile.ts`, `trpc/routers/profile.ts` — профиль (Task 9).

Web (`apps/web/src`):

- `lib/auth-client.ts` — плагины клиента, заголовок локали (Task 10).
- `features/auth/otp.ts`, `features/auth/auth-errors.ts`, `features/auth/use-auth-methods.ts` (Task 10).
- `features/auth/auth-sheet.tsx`, `features/auth/provider-buttons.tsx`, `features/auth/email-code-form.tsx`, `features/auth/placeholder-email.ts` (Task 10).
- `features/auth/telegram-login.ts` (Task 11).
- `features/auth/mobile-link.ts`, `features/auth/native-sign-in.ts`, `app/[locale]/auth/mobile/page.web.tsx`, `app/[locale]/auth/mobile/done/page.web.tsx`, `features/auth/mobile-auth.tsx` (Task 12).
- `features/auth/passkeys.ts`, `app/.well-known/*/route.web.ts`, нативный плагин `apps/web/native-plugins/passkey/` (Task 13).
- `features/profile/*`, `app/[locale]/profile/**`, `app/[locale]/u/**` (Tasks 14–16).
- `features/auth/passkey-offer.tsx` (Task 17).

---

### Task 1: Переменные окружения и конфигурация способов входа

**Files:**
- Modify: `apps/api/src/env.ts`
- Create: `apps/api/src/auth/config.ts`
- Create: `apps/api/src/auth/placeholder-email.ts`
- Test: `apps/api/src/auth/config.test.ts`

**Interfaces:**
- Produces:
  - `type ProviderId = 'yandex' | 'vk' | 'telegram' | 'google'`
  - `type AuthConfig = { google?: OAuthKeys; vk?: OAuthKeys; yandex?: OAuthKeys; telegram?: { botToken: string; botName: string; botId: string }; review?: { email: string; code: string }; passkey: { rpID: string; origins: string[]; ios: boolean; android: boolean } }`, `type OAuthKeys = { clientId: string; clientSecret: string }`
  - `authConfig(env: Env): AuthConfig`
  - `type AuthMethods = { email: true; providers: ProviderId[]; telegramBot: { name: string; id: string } | null; passkey: { web: true; ios: boolean; android: boolean } }`
  - `authMethods(config: AuthConfig): AuthMethods`
  - `androidOrigin(sha256: string): string`
  - `placeholderEmail(kind: 'tg' | 'vk', id: string): string`, `isPlaceholderEmail(email: string): boolean`

- [ ] **Step 1: Write the failing test**

`apps/api/src/auth/config.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { androidOrigin, authConfig, authMethods } from './config';
import { isPlaceholderEmail, placeholderEmail } from './placeholder-email';

const base = {
  DATABASE_URL: 'postgres://x',
  BETTER_AUTH_URL: 'https://chordtune.app',
  API_PORT: 4000,
  MEILI_URL: 'http://localhost:7700',
  WEB_ORIGINS: ['https://chordtune.app', 'capacitor://localhost', 'https://localhost'],
  MAIL_FROM: 'ChordTune <no-reply@chordtune.app>',
};

describe('authConfig', () => {
  test('enables only providers with both keys, in a fixed order', () => {
    const config = authConfig({
      ...base,
      GOOGLE_CLIENT_ID: 'g',
      GOOGLE_CLIENT_SECRET: 'gs',
      VK_CLIENT_ID: 'v',
      YANDEX_CLIENT_ID: 'y',
      YANDEX_CLIENT_SECRET: 'ys',
      TELEGRAM_BOT_TOKEN: '123456:abc',
      TELEGRAM_BOT_NAME: 'chordtune_bot',
    });
    expect(authMethods(config).providers).toEqual(['yandex', 'telegram', 'google']);
    expect(authMethods(config).telegramBot).toEqual({ name: 'chordtune_bot', id: '123456' });
  });

  test('passkey RP is the API host; origins are the http(s) web origins plus Android', () => {
    const config = authConfig({ ...base, ANDROID_CERT_SHA256: 'FF:'.repeat(31) + 'FF' });
    expect(config.passkey.rpID).toBe('chordtune.app');
    expect(config.passkey.origins).toEqual([
      'https://chordtune.app',
      'https://localhost',
      `android:apk-key-hash:${'_'.repeat(42)}8`,
    ]);
    expect(authMethods(config).passkey).toEqual({ web: true, ios: false, android: true });
  });

  test('review account needs both the email and the code', () => {
    expect(authConfig({ ...base, REVIEW_EMAIL: 'review@chordtune.app' }).review).toBeUndefined();
    expect(
      authConfig({ ...base, REVIEW_EMAIL: 'Review@ChordTune.app', REVIEW_CODE: '424242' }).review,
    ).toEqual({ email: 'review@chordtune.app', code: '424242' });
  });
});

describe('androidOrigin', () => {
  test('accepts colon-separated and plain hex', () => {
    const plain = 'ff'.repeat(32);
    expect(androidOrigin(plain)).toBe(androidOrigin('FF:'.repeat(31) + 'FF'));
  });
});

describe('placeholder emails', () => {
  test('are recognised and never collide with real domains', () => {
    expect(placeholderEmail('tg', '42')).toBe('tg-42@users.invalid');
    expect(isPlaceholderEmail('tg-42@users.invalid')).toBe(true);
    expect(isPlaceholderEmail('vasya@gmail.com')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/auth/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/env.ts` — добавить в `schema` (оставив существующие поля):

```ts
const optional = () =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined);

// …внутри z.object({ … }):
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
```

и в конце файла:

```ts
export type Env = z.infer<typeof schema>;
```

`apps/api/src/auth/placeholder-email.ts`:

```ts
/** `.invalid` is reserved (RFC 2606), so these addresses can never belong to a real mailbox. */
const DOMAIN = 'users.invalid';

/** Stands in for the email Better Auth requires when the provider gives none (Telegram, some VK). */
export function placeholderEmail(kind: 'tg' | 'vk', id: string) {
  return `${kind}-${id}@${DOMAIN}`;
}

export function isPlaceholderEmail(email: string) {
  return email.endsWith(`@${DOMAIN}`);
}
```

`apps/api/src/auth/config.ts`:

```ts
import type { Env } from '../env';

export type ProviderId = 'yandex' | 'vk' | 'telegram' | 'google';
export type OAuthKeys = { clientId: string; clientSecret: string };

export type AuthConfig = {
  google?: OAuthKeys;
  vk?: OAuthKeys;
  yandex?: OAuthKeys;
  telegram?: { botToken: string; botName: string; botId: string };
  review?: { email: string; code: string };
  passkey: { rpID: string; origins: string[]; ios: boolean; android: boolean };
};

export type AuthMethods = {
  email: true;
  providers: ProviderId[];
  telegramBot: { name: string; id: string } | null;
  passkey: { web: true; ios: boolean; android: boolean };
};

type AuthEnv = Pick<
  Env,
  | 'BETTER_AUTH_URL'
  | 'WEB_ORIGINS'
  | 'GOOGLE_CLIENT_ID'
  | 'GOOGLE_CLIENT_SECRET'
  | 'YANDEX_CLIENT_ID'
  | 'YANDEX_CLIENT_SECRET'
  | 'VK_CLIENT_ID'
  | 'VK_CLIENT_SECRET'
  | 'TELEGRAM_BOT_TOKEN'
  | 'TELEGRAM_BOT_NAME'
  | 'REVIEW_EMAIL'
  | 'REVIEW_CODE'
  | 'APPLE_TEAM_ID'
  | 'ANDROID_CERT_SHA256'
>;

const ORDER: ProviderId[] = ['yandex', 'vk', 'telegram', 'google'];

function keys(clientId?: string, clientSecret?: string): OAuthKeys | undefined {
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

/** The origin Android's Credential Manager reports for our APK: its signing key hash, base64url. */
export function androidOrigin(sha256: string) {
  const hex = sha256.replaceAll(':', '').toLowerCase();
  return `android:apk-key-hash:${Buffer.from(hex, 'hex').toString('base64url')}`;
}

export function authConfig(env: Partial<AuthEnv> & Pick<AuthEnv, 'BETTER_AUTH_URL' | 'WEB_ORIGINS'>): AuthConfig {
  const { TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_BOT_NAME: botName } = env;
  const webOrigins = env.WEB_ORIGINS.filter((origin) => /^https?:\/\//.test(origin));
  return {
    google: keys(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    vk: keys(env.VK_CLIENT_ID, env.VK_CLIENT_SECRET),
    yandex: keys(env.YANDEX_CLIENT_ID, env.YANDEX_CLIENT_SECRET),
    telegram:
      botToken && botName
        ? { botToken, botName, botId: botToken.split(':')[0] ?? '' }
        : undefined,
    review:
      env.REVIEW_EMAIL && env.REVIEW_CODE
        ? { email: env.REVIEW_EMAIL.toLowerCase(), code: env.REVIEW_CODE }
        : undefined,
    passkey: {
      rpID: new URL(env.BETTER_AUTH_URL).hostname,
      origins: env.ANDROID_CERT_SHA256
        ? [...webOrigins, androidOrigin(env.ANDROID_CERT_SHA256)]
        : webOrigins,
      ios: Boolean(env.APPLE_TEAM_ID),
      android: Boolean(env.ANDROID_CERT_SHA256),
    },
  };
}

export function authMethods(config: AuthConfig): AuthMethods {
  return {
    email: true,
    providers: ORDER.filter((id) => config[id] !== undefined),
    telegramBot: config.telegram
      ? { name: config.telegram.botName, id: config.telegram.botId }
      : null,
    passkey: { web: true, ios: config.passkey.ios, android: config.passkey.android },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/auth/config.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/env.ts apps/api/src/auth/config.ts apps/api/src/auth/placeholder-email.ts apps/api/src/auth/config.test.ts
git commit -m "Read sign-in provider settings from the environment"
```

---

### Task 2: Почта

**Files:**
- Modify: `apps/api/package.json` (зависимость `nodemailer`, dev `@types/nodemailer`)
- Create: `apps/api/src/mail/index.ts`
- Create: `apps/api/src/mail/otp-message.ts`
- Test: `apps/api/src/mail/otp-message.test.ts`

**Interfaces:**
- Produces:
  - `type Mail = { to: string; subject: string; text: string }`, `type Mailer = (mail: Mail) => Promise<void>`
  - `createMailer(options: { smtpUrl?: string; from: string }): Mailer`
  - `type MailLocale = 'ru' | 'en'`, `pickLocale(value: string | null | undefined): MailLocale`
  - `otpMessage(locale: MailLocale, code: string, purpose: 'sign-in' | 'change-email'): { subject: string; text: string }`

- [ ] **Step 1: Install**

```bash
cd apps/api && bun add nodemailer && bun add -d @types/nodemailer
```

- [ ] **Step 2: Write the failing test**

`apps/api/src/mail/otp-message.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { otpMessage, pickLocale } from './otp-message';

describe('pickLocale', () => {
  test('takes the language part and falls back to Russian', () => {
    expect(pickLocale('en')).toBe('en');
    expect(pickLocale('en-US')).toBe('en');
    expect(pickLocale('de')).toBe('ru');
    expect(pickLocale(null)).toBe('ru');
  });
});

describe('otpMessage', () => {
  test('puts the code in the subject and the body', () => {
    const ru = otpMessage('ru', '123456', 'sign-in');
    expect(ru.subject).toBe('123456 — код для входа в ChordTune');
    expect(ru.text).toContain('123456');
    expect(ru.text).toContain('5 минут');

    const en = otpMessage('en', '654321', 'change-email');
    expect(en.subject).toBe('654321 — your ChordTune email confirmation code');
    expect(en.text).toContain('654321');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && bun test src/mail`
Expected: FAIL — `Cannot find module './otp-message'`.

- [ ] **Step 4: Write minimal implementation**

`apps/api/src/mail/otp-message.ts`:

```ts
export type MailLocale = 'ru' | 'en';

/** The web app sends its interface language in `x-locale`; anything else reads Russian. */
export function pickLocale(value: string | null | undefined): MailLocale {
  return value?.split('-')[0]?.toLowerCase() === 'en' ? 'en' : 'ru';
}

const TEXTS = {
  ru: {
    'sign-in': (code: string) => `${code} — код для входа в ChordTune`,
    'change-email': (code: string) => `${code} — код подтверждения почты в ChordTune`,
    body: (code: string) =>
      `Ваш код: ${code}\n\nОн действует 5 минут. Если вы не запрашивали код, просто удалите это письмо.`,
  },
  en: {
    'sign-in': (code: string) => `${code} — your ChordTune sign-in code`,
    'change-email': (code: string) => `${code} — your ChordTune email confirmation code`,
    body: (code: string) =>
      `Your code: ${code}\n\nIt is valid for 5 minutes. If you did not ask for it, just delete this email.`,
  },
} as const;

export function otpMessage(locale: MailLocale, code: string, purpose: 'sign-in' | 'change-email') {
  const texts = TEXTS[locale];
  return { subject: texts[purpose](code), text: texts.body(code) };
}
```

`apps/api/src/mail/index.ts`:

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && bun test src/mail`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json bun.lock apps/api/src/mail
git commit -m "Send mail over any SMTP provider"
```

---

### Task 3: Фабрика Better Auth и вход по коду вместо пароля

**Files:**
- Create: `apps/api/src/auth/create-auth.ts`
- Modify: `apps/api/src/auth.ts` (весь файл)
- Modify: `apps/api/src/app.ts` (CORS: заголовок `x-locale`)
- Create: `apps/api/src/test/auth.ts`
- Test: `apps/api/src/auth/email-otp.test.ts`

**Interfaces:**
- Consumes: `AuthConfig` (Task 1), `Mailer`, `otpMessage`, `pickLocale` (Task 2), `isPlaceholderEmail` (Task 1).
- Produces:
  - `type AuthDeps = { db: Database; secret: string; baseURL: string; trustedOrigins: string[]; config: AuthConfig; mailer: Mailer }`
  - `createAuth(deps: AuthDeps)`, `type Auth = ReturnType<typeof createAuth>`
  - `MAIL_FAILED` — код ошибки, когда SMTP не принял письмо.
  - `createTestAuth(config?: Partial<AuthConfig>): Promise<{ db: Database; auth: Auth; sent: Mail[]; lastCode(): string; signIn(email: string): Promise<{ token: string; userId: string; headers: Headers }> }>` (`apps/api/src/test/auth.ts`)

- [ ] **Step 1: Write the failing test**

`apps/api/src/auth/email-otp.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { account, user } from '../db/schema';
import { createTestAuth } from '../test/auth';

let t: Awaited<ReturnType<typeof createTestAuth>>;

beforeEach(async () => {
  t = await createTestAuth({ review: { email: 'review@chordtune.app', code: '424242' } });
});

describe('email code sign-in', () => {
  test('a new email creates a verified user', async () => {
    const { userId } = await t.signIn('new@test.local');
    const [row] = await t.db.select().from(user).where(eq(user.id, userId));
    expect(row).toMatchObject({ email: 'new@test.local', emailVerified: true });
    expect(t.sent[0]?.subject).toContain('код для входа');
  });

  test('a former password user signs in to the same account, even with capitals', async () => {
    await t.db.insert(user).values({ id: 'old', name: 'Old', email: 'alice@test.local' });
    await t.db.insert(account).values({
      id: 'old-credential',
      userId: 'old',
      accountId: 'old',
      providerId: 'credential',
      password: 'hash',
      updatedAt: new Date(),
    });
    const { userId } = await t.signIn('Alice@Test.local');
    expect(userId).toBe('old');
  });

  test('three wrong codes burn the code', async () => {
    await t.auth.api.sendVerificationOTP({ body: { email: 'a@test.local', type: 'sign-in' } });
    const code = t.lastCode();
    for (let i = 0; i < 3; i++) {
      await expect(
        t.auth.api.signInEmailOTP({ body: { email: 'a@test.local', otp: '000000' } }),
      ).rejects.toThrow();
    }
    await expect(
      t.auth.api.signInEmailOTP({ body: { email: 'a@test.local', otp: code } }),
    ).rejects.toThrow();
  });

  test('the review account takes its fixed code and gets no mail', async () => {
    await t.auth.api.sendVerificationOTP({
      body: { email: 'review@chordtune.app', type: 'sign-in' },
    });
    expect(t.sent).toHaveLength(0);
    const result = await t.auth.api.signInEmailOTP({
      body: { email: 'review@chordtune.app', otp: '424242' },
    });
    expect(result.user.email).toBe('review@chordtune.app');
  });

  test('placeholder addresses get no mail', async () => {
    await t.auth.api.sendVerificationOTP({ body: { email: 'tg-1@users.invalid', type: 'sign-in' } });
    expect(t.sent).toHaveLength(0);
  });

  test('passwords are gone', async () => {
    await expect(
      t.auth.api.signUpEmail({ body: { email: 'p@test.local', password: '12345678', name: 'p' } }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/auth/email-otp.test.ts`
Expected: FAIL — `Cannot find module '../test/auth'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/auth/create-auth.ts`:

```ts
import { drizzleAdapter } from '@better-auth/drizzle-adapter/relations-v2';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { bearer, emailOTP } from 'better-auth/plugins';

import type { Database } from '../db';
import { tables } from '../db/schema';
import { type Mailer } from '../mail';
import { otpMessage, pickLocale } from '../mail/otp-message';
import type { AuthConfig } from './config';
import { isPlaceholderEmail } from './placeholder-email';

export type AuthDeps = {
  db: Database;
  secret: string;
  baseURL: string;
  trustedOrigins: string[];
  config: AuthConfig;
  mailer: Mailer;
};

export const MAIL_FAILED = 'MAIL_FAILED';

export function createAuth({ db, secret, baseURL, trustedOrigins, config, mailer }: AuthDeps) {
  const isReviewEmail = (email: string) => email === config.review?.email;

  return betterAuth({
    baseURL,
    secret,
    database: drizzleAdapter(db, { provider: 'pg', schema: tables }),
    trustedOrigins,
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        changeEmail: { enabled: true },
        // Store reviewers cannot read our mail, so their address always takes the configured code.
        generateOTP: ({ email }) => (isReviewEmail(email) ? config.review?.code : undefined),
        async sendVerificationOTP({ email, otp, type }, ctx) {
          if (isPlaceholderEmail(email) || isReviewEmail(email)) {
            return;
          }
          const locale = pickLocale(ctx?.request?.headers.get('x-locale'));
          const message = otpMessage(locale, otp, type === 'change-email' ? 'change-email' : 'sign-in');
          try {
            await mailer({ to: email, ...message });
          } catch (error) {
            console.error('[mail] sending the code failed', error);
            throw new APIError('SERVICE_UNAVAILABLE', { message: 'Mail failed', code: MAIL_FAILED });
          }
        },
      }),
      // Capacitor WebViews run on capacitor:// or https://localhost, where third-party cookies to the
      // API are unreliable, so every build authenticates with a bearer token.
      bearer(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
```

`apps/api/src/auth.ts` (весь файл):

```ts
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
```

`apps/api/src/app.ts` — в `cors({...})`:

```ts
    allowHeaders: ['Content-Type', 'Authorization', 'x-locale'],
```

`apps/api/src/test/auth.ts`:

```ts
import { type AuthConfig } from '../auth/config';
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/auth/email-otp.test.ts`
Expected: PASS (6 tests). Если `signUpEmail` не существует как метод при выключенном пароле и TS ругается — замени последний тест на `expect('signUpEmail' in t.auth.api).toBe(false)` либо проверку, что запрос `POST /api/auth/sign-up/email` через `t.auth.handler` отвечает не 200.

- [ ] **Step 5: Run the whole API suite and types**

Run: `cd apps/api && bun test && bun run check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth.ts apps/api/src/auth/create-auth.ts apps/api/src/app.ts apps/api/src/test/auth.ts apps/api/src/auth/email-otp.test.ts
git commit -m "Sign in with a mailed code instead of a password"
```

---

### Task 4: Ник

**Files:**
- Create: `apps/api/src/auth/username.ts`
- Modify: `apps/api/src/auth/create-auth.ts` (плагин `username`, `databaseHooks`)
- Modify: `apps/api/src/db/auth-schema.ts` (перегенерируется), `apps/api/src/db/schema.ts`
- Create: миграция в `apps/api/drizzle/` (через `db:generate`)
- Modify: `apps/api/src/index.ts` (backfill после миграций)
- Test: `apps/api/src/auth/username.test.ts`

**Interfaces:**
- Consumes: `isPlaceholderEmail` (Task 1), `toLatin` (`src/lib/translit.ts`), `createTestAuth` (Task 3).
- Produces:
  - `RESERVED_USERNAMES: ReadonlySet<string>`, `isValidUsername(value: string): boolean`
  - `usernameBase(candidates: (string | null | undefined)[]): string`
  - `uniqueUsername(db: Database, base: string): Promise<string>`
  - `usernameHints(user: { email: string; name: string; username?: string | null }): string[]`
  - `backfillUsernames(db: Database): Promise<number>`
  - колонка `user.username` (`text`, unique, nullable в базе, всегда заполнена кодом)

- [ ] **Step 1: Write the failing test**

`apps/api/src/auth/username.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { user } from '../db/schema';
import { createTestAuth } from '../test/auth';
import { createTestDb } from '../test/db';
import { backfillUsernames, isValidUsername, uniqueUsername, usernameBase } from './username';

describe('usernameBase', () => {
  test('first usable candidate, transliterated and cleaned', () => {
    expect(usernameBase(['Вася Пупкин'])).toBe('vasya_pupkin');
    expect(usernameBase([null, 'ivan.petrov+tag'])).toBe('ivan_petrov_tag');
    expect(usernameBase(['!!!', 'Kino'])).toBe('kino');
  });

  test('pads short results, trims long ones, avoids reserved names', () => {
    expect(usernameBase(['ab'])).toMatch(/^ab\d{1,}$/);
    expect(usernameBase(['ab']).length).toBeGreaterThanOrEqual(3);
    expect(usernameBase(['a'.repeat(50)])).toHaveLength(30);
    expect(usernameBase(['admin'])).not.toBe('admin');
    expect(usernameBase([])).toBe('user');
  });
});

describe('isValidUsername', () => {
  test('format and reserved list', () => {
    expect(isValidUsername('vasya_2')).toBe(true);
    expect(isValidUsername('Vasya')).toBe(false);
    expect(isValidUsername('va')).toBe(false);
    expect(isValidUsername('profile')).toBe(false);
  });
});

describe('uniqueUsername', () => {
  test('adds a number on collision', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: '1', name: 'a', email: 'a@x', username: 'vasya' });
    await db.insert(user).values({ id: '2', name: 'b', email: 'b@x', username: 'vasya2' });
    expect(await uniqueUsername(db, 'vasya')).toBe('vasya3');
    expect(await uniqueUsername(db, 'petya')).toBe('petya');
  });
});

describe('new users', () => {
  test('get a username from the email, not from a placeholder', async () => {
    const t = await createTestAuth();
    const { userId } = await t.signIn('Ivan.Petrov@test.local');
    const [row] = await t.db.select().from(user).where(eq(user.id, userId));
    expect(row?.username).toBe('ivan_petrov');
  });
});

describe('backfillUsernames', () => {
  test('fills only missing ones', async () => {
    const db = await createTestDb();
    await db.insert(user).values({ id: '1', name: 'Маша', email: 'masha@x.ru' });
    await db.insert(user).values({ id: '2', name: 'Kept', email: 'kept@x.ru', username: 'kept' });
    expect(await backfillUsernames(db)).toBe(1);
    const rows = await db.select({ id: user.id, username: user.username }).from(user);
    expect(rows.sort((a, b) => a.id.localeCompare(b.id))).toEqual([
      { id: '1', username: 'masha' },
      { id: '2', username: 'kept' },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/auth/username.test.ts`
Expected: FAIL — `Cannot find module './username'`.

- [ ] **Step 3: Add the plugin and regenerate the schema**

В `create-auth.ts` импортировать `username` из `better-auth/plugins` и добавить в `plugins` (перед `bearer()`):

```ts
      username({
        minUsernameLength: 3,
        maxUsernameLength: 30,
        // The name on the site is `user.name`; a second display field would only confuse.
        displayUsername: false,
        usernameValidator: isValidUsername,
      }),
```

Затем перегенерировать схему и миграцию (нужен `bun run db:up`):

```bash
cd apps/api && bun run auth:generate && bun run db:generate
```

Проверь diff `src/db/auth-schema.ts`: у `user` появилось `username: text('username').unique()`. Если CLI переписал файл иначе (порядок, `defineRelationsPart`), сохрани существующую структуру файла и добавь только колонку. Миграция в `apps/api/drizzle/<timestamp>_*/migration.sql` должна содержать `ALTER TABLE "user" ADD COLUMN "username" text` и уникальное ограничение.

- [ ] **Step 4: Write the username module**

`apps/api/src/auth/username.ts`:

```ts
import { isNull, like, or, eq } from 'drizzle-orm';

import type { Database } from '../db';
import { user } from '../db/schema';
import { toLatin } from '../lib/translit';
import { isPlaceholderEmail } from './placeholder-email';

const MIN = 3;
const MAX = 30;

/** Path segments and words that would read as official if someone took them. */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'chordtune', 'edit', 'help', 'login', 'logout',
  'me', 'moderator', 'new', 'null', 'profile', 'root', 'security', 'settings', 'signin', 'signup',
  'support', 'system', 'u', 'undefined', 'user', 'users',
]);

export function isValidUsername(value: string) {
  return /^[a-z0-9_]{3,30}$/.test(value) && !RESERVED_USERNAMES.has(value);
}

function clean(value: string) {
  return toLatin(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, MAX)
    .replace(/_+$/, '');
}

/** A valid starting point for a username; `uniqueUsername` resolves collisions. */
export function usernameBase(candidates: (string | null | undefined)[]): string {
  for (const candidate of candidates) {
    let base = candidate ? clean(candidate) : '';
    if (!base) {
      continue;
    }
    if (base.length < MIN) {
      base = `${base}${Math.floor(Math.random() * 900 + 100)}`.slice(0, MAX);
    }
    if (RESERVED_USERNAMES.has(base)) {
      base = `${base}_${Math.floor(Math.random() * 90 + 10)}`;
    }
    return base;
  }
  return 'user';
}

/** `base`, or `base2`, `base3`… whichever is free. Suffixes may push past 30 characters, so trim first. */
export async function uniqueUsername(db: Database, base: string): Promise<string> {
  const taken = new Set(
    (
      await db
        .select({ username: user.username })
        .from(user)
        .where(or(eq(user.username, base), like(user.username, `${base}%`)))
    ).map((row) => row.username),
  );
  if (!taken.has(base) && base !== 'user') {
    return base;
  }
  for (let n = 2; ; n++) {
    const suffix = String(n);
    const candidate = `${base.slice(0, MAX - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) {
      return candidate;
    }
  }
}

/** Where a new user's username comes from, best first. */
export function usernameHints(data: { email: string; name: string; username?: string | null }) {
  const local = isPlaceholderEmail(data.email) ? null : data.email.split('@')[0];
  return [data.username, local, data.name].filter((value): value is string => Boolean(value));
}

/** Gives a username to users created before usernames existed. Safe to run on every start. */
export async function backfillUsernames(db: Database): Promise<number> {
  const missing = await db
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(isNull(user.username));
  for (const row of missing) {
    const username = await uniqueUsername(db, usernameBase(usernameHints(row)));
    await db.update(user).set({ username }).where(eq(user.id, row.id));
  }
  return missing.length;
}
```

В `create-auth.ts` добавить в объект `betterAuth({...})`:

```ts
    databaseHooks: {
      user: {
        create: {
          // Every user gets a username at creation; `username` may arrive as a hint (Telegram).
          before: async (data) => ({
            data: {
              ...data,
              username: await uniqueUsername(db, usernameBase(usernameHints(data))),
            },
          }),
        },
      },
    },
```

`apps/api/src/index.ts` — после `await migrateDatabase();`:

```ts
// Users from before usernames get theirs once; later starts find nothing to do.
const { backfillUsernames } = await import('./auth/username');
const { db } = await import('./db');
await backfillUsernames(db);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && bun test src/auth/username.test.ts && bun test`
Expected: PASS. `uniqueUsername(db, 'user')` никогда не отдаёт голое `user` — оно зарезервировано.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth apps/api/src/db apps/api/drizzle apps/api/src/index.ts
git commit -m "Give every user a username"
```

---

### Task 5: Google, VK и Яндекс

**Files:**
- Create: `apps/api/src/auth/providers.ts`
- Modify: `apps/api/src/auth/create-auth.ts`
- Test: `apps/api/src/auth/providers.test.ts`

**Interfaces:**
- Consumes: `AuthConfig`, `placeholderEmail` (Task 1).
- Produces:
  - `socialProviders(config: AuthConfig)` — объект для `betterAuth({ socialProviders })`
  - `genericProviders(config: AuthConfig)` — массив для `genericOAuth({ config })`
  - `vkProfileToUser(profile: { user: { user_id: string | number; email?: string } }): { email?: string }`
  - `TRUSTED_PROVIDERS = ['google', 'yandex'] as const`
- Колбэки: `/api/auth/callback/google`, `/api/auth/callback/vk`, `/api/auth/callback/yandex` (Better Auth 1.7.6 serves genericOAuth providers through the core `callback/:id` route).

- [ ] **Step 1: Write the failing test**

`apps/api/src/auth/providers.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import type { AuthConfig } from './config';
import { genericProviders, socialProviders, TRUSTED_PROVIDERS, vkProfileToUser } from './providers';

const passkey = { rpID: 'localhost', origins: [], ios: false, android: false };

describe('providers', () => {
  test('only configured providers are registered', () => {
    const config: AuthConfig = {
      passkey,
      google: { clientId: 'g', clientSecret: 'gs' },
      yandex: { clientId: 'y', clientSecret: 'ys' },
    };
    expect(Object.keys(socialProviders(config))).toEqual(['google']);
    expect(genericProviders(config).map((provider) => provider.providerId)).toEqual(['yandex']);
    expect(Object.keys(socialProviders({ passkey }))).toEqual([]);
  });

  test('only providers that verify email link by it', () => {
    expect([...TRUSTED_PROVIDERS]).toEqual(['google', 'yandex']);
  });
});

describe('vkProfileToUser', () => {
  test('keeps the VK email or stands in a placeholder', () => {
    expect(vkProfileToUser({ user: { user_id: 7, email: 'v@vk.com' } })).toEqual({});
    expect(vkProfileToUser({ user: { user_id: 7 } })).toEqual({ email: 'vk-7@users.invalid' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/auth/providers.test.ts`
Expected: FAIL — `Cannot find module './providers'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/auth/providers.ts`:

```ts
import { yandex } from 'better-auth/plugins';

import type { AuthConfig } from './config';
import { placeholderEmail } from './placeholder-email';

/** Providers whose email is verified, so signing in with them may join an account of that email. */
export const TRUSTED_PROVIDERS = ['google', 'yandex'] as const;

/** Better Auth drops a VK sign-in without an email; a placeholder keeps the account usable. */
export function vkProfileToUser(profile: { user: { user_id: string | number; email?: string } }) {
  return profile.user.email ? {} : { email: placeholderEmail('vk', String(profile.user.user_id)) };
}

export function socialProviders(config: AuthConfig) {
  return {
    ...(config.google && { google: { ...config.google, prompt: 'select_account' as const } }),
    ...(config.vk && { vk: { ...config.vk, mapProfileToUser: vkProfileToUser } }),
  };
}

export function genericProviders(config: AuthConfig) {
  return config.yandex ? [yandex(config.yandex)] : [];
}
```

`create-auth.ts`: импортировать `genericOAuth` из `better-auth/plugins` и провайдеры; добавить в `betterAuth({...})`:

```ts
    socialProviders: socialProviders(config),
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: [...TRUSTED_PROVIDERS],
        // Linking from the profile is done while signed in, so a different email there is fine —
        // Telegram and VK accounts often have none.
        allowDifferentEmails: true,
        // We guard the last sign-in method ourselves (Task 7): Better Auth counts only provider
        // accounts and would refuse to unlink a provider from a user who also signs in by email.
        allowUnlinkingAll: true,
      },
    },
```

и в `plugins` (перед `bearer()`):

```ts
      ...(config.yandex ? [genericOAuth({ config: genericProviders(config) })] : []),
```

Если TS не принимает `mapProfileToUser` с такой сигнатурой, типизируй параметр как `Parameters<NonNullable<VkOptions['mapProfileToUser']>>[0]` из `better-auth/social-providers` и приведи внутри — поведение то же.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test src/auth && bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/auth
git commit -m "Sign in with Google, VK and Yandex"
```

Склейку на живых провайдерах (Google с той же почтой попадает в существующий аккаунт, VK — нет) проверяет пользователь с настоящими ключами; юнит-тест закрепляет конфигурацию.

---

### Task 6: Telegram

**Files:**
- Create: `apps/api/src/auth/telegram.ts`
- Create: `apps/api/src/auth/telegram-plugin.ts`
- Modify: `apps/api/src/auth/create-auth.ts`
- Test: `apps/api/src/auth/telegram.test.ts`

**Interfaces:**
- Consumes: `placeholderEmail` (Task 1), `createTestAuth` (Task 3), username hook (Task 4).
- Produces:
  - `type TelegramLogin = { id: number; first_name: string; last_name?: string; username?: string; photo_url?: string; auth_date: number; hash: string }`
  - `verifyTelegramLogin(data: Record<string, unknown>, botToken: string, nowSeconds?: number): TelegramLogin | null`
  - `TELEGRAM_MAX_AGE_SECONDS = 600`
  - плагин `telegram({ botToken })`: `POST /api/auth/telegram/sign-in` (тело — поля виджета, ответ `{ token, user }` + сессия), `POST /api/auth/telegram/link` (нужна сессия, ответ `{ linked: true }`); коды ошибок `INVALID_TELEGRAM_LOGIN`, `TELEGRAM_ALREADY_LINKED`. На сервере методы `auth.api.signInTelegram`, `auth.api.linkTelegram`.

- [ ] **Step 1: Write the failing test**

`apps/api/src/auth/telegram.test.ts`:

```ts
import { createHash, createHmac } from 'node:crypto';
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { account, user } from '../db/schema';
import { createTestAuth } from '../test/auth';
import { verifyTelegramLogin } from './telegram';

const BOT = '123456:test-token';

/** Signs widget fields the way Telegram documents it, independently of the code under test. */
function sign(fields: Record<string, string | number>, botToken = BOT) {
  const check = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  return { ...fields, hash: createHmac('sha256', secret).update(check).digest('hex') };
}

const now = () => Math.floor(Date.now() / 1000);

describe('verifyTelegramLogin', () => {
  const fields = { id: 42, first_name: 'Вася', username: 'vasya_tg', auth_date: 1_700_000_000 };

  test('accepts a fresh signed login', () => {
    expect(verifyTelegramLogin(sign(fields), BOT, 1_700_000_100)).toMatchObject({ id: 42 });
  });

  test('accepts query-string values (redirect mode sends strings)', () => {
    const signed = sign(fields);
    const asStrings = Object.fromEntries(Object.entries(signed).map(([k, v]) => [k, String(v)]));
    expect(verifyTelegramLogin(asStrings, BOT, 1_700_000_100)).toMatchObject({ id: 42 });
  });

  test('rejects a forged, re-signed or stale login', () => {
    expect(verifyTelegramLogin({ ...sign(fields), id: 43 }, BOT, 1_700_000_100)).toBeNull();
    expect(verifyTelegramLogin(sign(fields, '1:other'), BOT, 1_700_000_100)).toBeNull();
    expect(verifyTelegramLogin(sign(fields), BOT, 1_700_000_000 + 601)).toBeNull();
    expect(verifyTelegramLogin({ id: 42 }, BOT, 1_700_000_100)).toBeNull();
  });
});

describe('telegram plugin', () => {
  test('first sign-in creates a user without a real email; the next finds it', async () => {
    const t = await createTestAuth({
      telegram: { botToken: BOT, botName: 'bot', botId: '123456' },
    });
    const body = sign({ id: 42, first_name: 'Вася', username: 'Vasya_TG', auth_date: now() });
    const first = await t.auth.api.signInTelegram({ body });
    const second = await t.auth.api.signInTelegram({ body });
    expect(second.user.id).toBe(first.user.id);
    const [row] = await t.db.select().from(user).where(eq(user.id, first.user.id));
    expect(row).toMatchObject({ email: 'tg-42@users.invalid', name: 'Вася', username: 'vasya_tg' });
  });

  test('linking attaches Telegram to the signed-in user, once', async () => {
    const t = await createTestAuth({
      telegram: { botToken: BOT, botName: 'bot', botId: '123456' },
    });
    const alice = await t.signIn('alice@test.local');
    const bob = await t.signIn('bob@test.local');
    const body = sign({ id: 7, first_name: 'A', auth_date: now() });

    await t.auth.api.linkTelegram({ body, headers: alice.headers });
    const linked = await t.db.select().from(account).where(eq(account.providerId, 'telegram'));
    expect(linked.map((row) => row.userId)).toEqual([alice.userId]);

    await expect(t.auth.api.linkTelegram({ body, headers: bob.headers })).rejects.toThrow();
    const signedIn = await t.auth.api.signInTelegram({ body });
    expect(signedIn.user.id).toBe(alice.userId);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/auth/telegram.test.ts`
Expected: FAIL — `Cannot find module './telegram'`.

- [ ] **Step 3: Write the verifier**

`apps/api/src/auth/telegram.ts`:

```ts
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export const TELEGRAM_MAX_AGE_SECONDS = 600;

const loginSchema = z.object({
  id: z.coerce.number().int().positive(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.coerce.number().int(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
});

export type TelegramLogin = z.infer<typeof loginSchema>;

/**
 * Checks the Login Widget signature: HMAC-SHA256 of the sorted `key=value` lines, keyed by
 * SHA-256 of the bot token. The check string is built from the raw fields, so fields Telegram
 * adds later still verify.
 */
export function verifyTelegramLogin(
  data: Record<string, unknown>,
  botToken: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): TelegramLogin | null {
  const parsed = loginSchema.safeParse(data);
  if (!parsed.success) {
    return null;
  }
  const check = Object.keys(data)
    .filter((key) => key !== 'hash' && data[key] !== undefined && data[key] !== null)
    .sort()
    .map((key) => `${key}=${String(data[key])}`)
    .join('\n');
  const secret = createHash('sha256').update(botToken).digest();
  const expected = Buffer.from(createHmac('sha256', secret).update(check).digest('hex'));
  const given = Buffer.from(parsed.data.hash);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return null;
  }
  const age = nowSeconds - parsed.data.auth_date;
  return age <= TELEGRAM_MAX_AGE_SECONDS && age >= -60 ? parsed.data : null;
}
```

- [ ] **Step 4: Write the plugin**

`apps/api/src/auth/telegram-plugin.ts`:

```ts
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

import { placeholderEmail } from './placeholder-email';
import { verifyTelegramLogin } from './telegram';

const body = z.record(z.string(), z.unknown());

function invalid() {
  return new APIError('UNAUTHORIZED', {
    message: 'Invalid Telegram login',
    code: 'INVALID_TELEGRAM_LOGIN',
  });
}

export function telegram({ botToken }: { botToken: string }) {
  return {
    id: 'telegram',
    endpoints: {
      signInTelegram: createAuthEndpoint(
        '/telegram/sign-in',
        { method: 'POST', body },
        async (ctx) => {
          const login = verifyTelegramLogin(ctx.body, botToken);
          if (!login) {
            throw invalid();
          }
          const accountId = String(login.id);
          const existing = await ctx.context.adapter.findOne<{ userId: string }>({
            model: 'account',
            where: [
              { field: 'providerId', value: 'telegram' },
              { field: 'accountId', value: accountId },
            ],
          });
          let user = existing ? await ctx.context.internalAdapter.findUserById(existing.userId) : null;
          if (!user) {
            const profile = {
              email: placeholderEmail('tg', accountId),
              emailVerified: false,
              name: [login.first_name, login.last_name].filter(Boolean).join(' '),
              image: login.photo_url ?? null,
              // A hint for the username hook (Task 4), not a field the client can set.
              username: login.username,
            };
            const created = await ctx.context.internalAdapter.createOAuthUser(profile, {
              providerId: 'telegram',
              accountId,
            });
            user = created.user;
          }
          const session = await ctx.context.internalAdapter.createSession(user.id);
          await setSessionCookie(ctx, { session, user });
          return ctx.json({ token: session.token, user });
        },
      ),
      linkTelegram: createAuthEndpoint(
        '/telegram/link',
        { method: 'POST', body, use: [sessionMiddleware] },
        async (ctx) => {
          const login = verifyTelegramLogin(ctx.body, botToken);
          if (!login) {
            throw invalid();
          }
          const accountId = String(login.id);
          const userId = ctx.context.session.user.id;
          const existing = await ctx.context.adapter.findOne<{ userId: string }>({
            model: 'account',
            where: [
              { field: 'providerId', value: 'telegram' },
              { field: 'accountId', value: accountId },
            ],
          });
          if (existing && existing.userId !== userId) {
            throw new APIError('BAD_REQUEST', {
              message: 'This Telegram account belongs to another user',
              code: 'TELEGRAM_ALREADY_LINKED',
            });
          }
          if (!existing) {
            await ctx.context.internalAdapter.linkAccount({ userId, providerId: 'telegram', accountId });
          }
          return ctx.json({ linked: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
}
```

Если TS отвергает лишнее поле `username` в `createOAuthUser` (excess property check), объект `profile` уже вынесен в переменную — этого достаточно; если всё равно нет, используй `as Parameters<typeof ctx.context.internalAdapter.createOAuthUser>[0]`.

`create-auth.ts`, в `plugins` перед `bearer()`:

```ts
      ...(config.telegram ? [telegram({ botToken: config.telegram.botToken })] : []),
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && bun test src/auth/telegram.test.ts && bun run check-types`
Expected: PASS. Если `auth.api.signInTelegram` не типизирован из-за условного массива плагинов — в тестах создавай `createTestAuth` с telegram и обращайся через `(t.auth.api as unknown as TelegramApi)`, где `TelegramApi` описан в тесте; но сначала попробуй без приведения.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/auth
git commit -m "Sign in and link accounts with Telegram"
```

---

### Task 7: Одноразовый токен, passkeys, список способов входа и защита последнего

**Files:**
- Modify: `apps/api/package.json` (`@better-auth/passkey@1.7.6`)
- Create: `apps/api/src/auth/sign-in-methods.ts`
- Modify: `apps/api/src/auth/create-auth.ts`
- Modify: `apps/api/src/db/auth-schema.ts`, `apps/api/src/db/schema.ts` (таблица `passkey`, в `tables`)
- Create: миграция (через `db:generate`)
- Create: `apps/api/src/trpc/routers/auth.ts`; Modify: `apps/api/src/trpc/router.ts`
- Test: `apps/api/src/auth/sign-in-methods.test.ts`

**Interfaces:**
- Consumes: `authMethods`, `authConfig` (Task 1), `isPlaceholderEmail`, `createTestAuth`.
- Produces:
  - `signInMethodCount(db: Database, userId: string): Promise<number>`
  - `LAST_SIGN_IN_METHOD` — код ошибки
  - tRPC `auth.methods` → `AuthMethods`
  - эндпоинты `/api/auth/one-time-token/generate` (GET, нужна сессия) → `{ token }`, `/api/auth/one-time-token/verify` (POST `{ token }`) → `{ session, user }`
  - эндпоинты `/api/auth/passkey/*` (generate-register-options, verify-registration, generate-authenticate-options, verify-authentication, list-user-passkeys, delete-passkey, update-passkey)

- [ ] **Step 1: Install and add plugins**

```bash
cd apps/api && bun add @better-auth/passkey@1.7.6
```

В `create-auth.ts`:

```ts
import { passkey } from '@better-auth/passkey';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { bearer, emailOTP, genericOAuth, oneTimeToken, username } from 'better-auth/plugins';
```

В `plugins` перед `bearer()`:

```ts
      // The system browser signs in on the web and hands the app a one-time token by deep link.
      oneTimeToken({ expiresIn: 3 }),
      passkey({ rpID: config.passkey.rpID, rpName: 'ChordTune', origin: config.passkey.origins }),
```

Перегенерировать схему и миграцию: `bun run auth:generate && bun run db:generate`. В `schema.ts` импортировать `passkey` из `./auth-schema` и сделать `export const tables = { user, session, account, verification, passkey };`.

- [ ] **Step 2: Write the failing test**

`apps/api/src/auth/sign-in-methods.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { account, user } from '../db/schema';
import { createTestAuth } from '../test/auth';
import { signInMethodCount } from './sign-in-methods';

describe('signInMethodCount', () => {
  test('counts providers, passkeys and a real verified email; not old passwords', async () => {
    const t = await createTestAuth();
    const { userId } = await t.signIn('a@test.local');
    expect(await signInMethodCount(t.db, userId)).toBe(1);

    await t.db.insert(account).values([
      { id: 'c', userId, accountId: userId, providerId: 'credential', updatedAt: new Date() },
      { id: 'y', userId, accountId: 'y1', providerId: 'yandex', updatedAt: new Date() },
    ]);
    expect(await signInMethodCount(t.db, userId)).toBe(2);

    await t.db.update(user).set({ email: 'tg-1@users.invalid' }).where(eq(user.id, userId));
    expect(await signInMethodCount(t.db, userId)).toBe(1);
  });
});

describe('last sign-in method', () => {
  test('cannot be unlinked; one of two can', async () => {
    const t = await createTestAuth();
    const { userId, headers } = await t.signIn('a@test.local');
    await t.db.insert(account).values([
      { id: 'y', userId, accountId: 'y1', providerId: 'yandex', updatedAt: new Date() },
    ]);
    await t.auth.api.unlinkAccount({ body: { providerId: 'yandex' }, headers });
    expect(await signInMethodCount(t.db, userId)).toBe(1);

    await t.db.update(user).set({ email: 'tg-1@users.invalid' }).where(eq(user.id, userId));
    await t.db.insert(account).values([
      { id: 'v', userId, accountId: 'v1', providerId: 'vk', updatedAt: new Date() },
    ]);
    await expect(
      t.auth.api.unlinkAccount({ body: { providerId: 'vk' }, headers }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/api && bun test src/auth/sign-in-methods.test.ts`
Expected: FAIL — `Cannot find module './sign-in-methods'`.

- [ ] **Step 4: Write minimal implementation**

`apps/api/src/auth/sign-in-methods.ts`:

```ts
import { and, eq, ne } from 'drizzle-orm';

import type { Database } from '../db';
import { account, passkey, user } from '../db/schema';
import { isPlaceholderEmail } from './placeholder-email';

export const LAST_SIGN_IN_METHOD = 'LAST_SIGN_IN_METHOD';

/** Ways a user can still get in: linked providers, passkeys and a real verified email. */
export async function signInMethodCount(db: Database, userId: string): Promise<number> {
  const [providers, passkeys, [owner]] = await Promise.all([
    // `credential` rows are passwords from before; they no longer sign anyone in.
    db.$count(account, and(eq(account.userId, userId), ne(account.providerId, 'credential'))),
    db.$count(passkey, eq(passkey.userId, userId)),
    db
      .select({ email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, userId)),
  ]);
  const email = owner?.emailVerified && !isPlaceholderEmail(owner.email) ? 1 : 0;
  return providers + passkeys + email;
}
```

В `create-auth.ts` добавить в `betterAuth({...})`:

```ts
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/unlink-account' && ctx.path !== '/passkey/delete-passkey') {
          return;
        }
        const session = await getSessionFromCtx(ctx);
        if (session && (await signInMethodCount(db, session.user.id)) <= 1) {
          throw new APIError('BAD_REQUEST', {
            message: 'This is the last way to sign in',
            code: LAST_SIGN_IN_METHOD,
          });
        }
      }),
    },
```

`apps/api/src/trpc/routers/auth.ts`:

```ts
import { authConfig, authMethods } from '../../auth/config';
import { env } from '../../env';
import { publicProcedure, router } from '../init';

const methods = authMethods(authConfig(env));

/** The static mobile build cannot read server env, so it asks which sign-in buttons to show. */
export const authRouter = router({
  methods: publicProcedure.query(() => methods),
});
```

`apps/api/src/trpc/router.ts`: импортировать `authRouter` и добавить `auth: authRouter,`.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && bun test && bun run check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api
git commit -m "Add passkeys, one-time tokens and the list of sign-in methods"
```

---

### Task 8: Удаление аккаунта, разборы остаются без автора

**Files:**
- Modify: `apps/api/src/db/schema.ts` (`arrangement.authorId` nullable, `set null`; relation `optional: true`)
- Create: миграция (через `db:generate`)
- Modify: `apps/api/src/services/arrangements.ts` (`WITH_DETAILS.author` добавляет `username`)
- Create: `apps/api/src/auth/delete-account.ts`
- Modify: `apps/api/src/auth/create-auth.ts`
- Modify: `apps/web/src/features/song/song-header.tsx`, `apps/web/src/features/song/song-view.tsx`, `apps/web/messages/*.json` (автор может быть `null`)
- Test: `apps/api/src/auth/delete-account.test.ts`

**Interfaces:**
- Consumes: `createTestAuth`, `saveArrangement` (`src/services/save-arrangement.ts`), `noopSearch`.
- Produces:
  - `REAUTH_REQUIRED` — код ошибки; `RECENT_SIGN_IN_MINUTES = 10`
  - `isRecentSignIn(sessionCreatedAt: Date, now?: Date): boolean`
  - `ArrangementView.author: { id: string; name: string; username: string | null } | null`

- [ ] **Step 1: Write the failing test**

`apps/api/src/auth/delete-account.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import { arrangement, session } from '../db/schema';
import { noopSearch } from '../search';
import { saveArrangement } from '../services/save-arrangement';
import { createTestAuth } from '../test/auth';
import { isRecentSignIn } from './delete-account';

const input = {
  artist: { name: 'LUMEN' },
  song: { title: 'Гореть' },
  content: '${Am}la',
  rhythms: [],
  capo: null,
  tempo: null,
  key: null,
  notes: '',
  tuning: 'standard' as const,
  voicings: {},
  zenMode: null,
};

describe('isRecentSignIn', () => {
  test('ten minutes', () => {
    const now = new Date('2026-10-07T12:00:00Z');
    expect(isRecentSignIn(new Date('2026-10-07T11:51:00Z'), now)).toBe(true);
    expect(isRecentSignIn(new Date('2026-10-07T11:49:00Z'), now)).toBe(false);
  });
});

describe('deleting an account', () => {
  test('keeps published arrangements with no author', async () => {
    const t = await createTestAuth();
    const { userId, headers } = await t.signIn('a@test.local');
    const saved = await saveArrangement(t.db, noopSearch, { authorId: userId, input });

    await t.auth.api.deleteUser({ body: {}, headers });

    const [row] = await t.db.select().from(arrangement).where(eq(arrangement.id, saved.id));
    expect(row?.authorId).toBeNull();
  });

  test('needs a recent sign-in', async () => {
    const t = await createTestAuth();
    const { userId, headers } = await t.signIn('a@test.local');
    await t.db
      .update(session)
      .set({ createdAt: new Date(Date.now() - 20 * 60_000) })
      .where(eq(session.userId, userId));
    await expect(t.auth.api.deleteUser({ body: {}, headers })).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/auth/delete-account.test.ts`
Expected: FAIL — `Cannot find module './delete-account'`.

- [ ] **Step 3: Schema change**

`schema.ts`, в `arrangement`:

```ts
    // Null once the author deletes their account: the arrangement stays, credited to «Anonymous».
    authorId: text('author_id').references(() => user.id, { onDelete: 'set null' }),
```

и в relations: `author: r.one.user({ from: r.arrangement.authorId, to: r.user.id, optional: true }),`.

`arrangements.ts`: `author: { columns: { id: true, name: true, username: true } },`.

Run: `cd apps/api && bun run db:generate` — миграция должна содержать `DROP NOT NULL` и пересоздание FK с `ON DELETE set null`.

Run: `bun run check-types` в корне и исправь места, где `author` теперь может быть `null`:
- `apps/web/src/features/song/song-header.tsx`: `const isAuthor = Boolean(arrangement.author) && session.data?.user.id === arrangement.author?.id;`
- `apps/web/src/features/song/song-view.tsx:195`: `<span>{t('by', { name: arrangement.author?.name ?? t('anonymous') })}</span>` (ссылку на профиль добавит Task 14).
- `messages/ru.json` → `song.anonymous: "Аноним"`, `messages/en.json` → `song.anonymous: "Anonymous"`.

- [ ] **Step 4: Write the rule and the hook**

`apps/api/src/auth/delete-account.ts`:

```ts
export const REAUTH_REQUIRED = 'REAUTH_REQUIRED';
export const RECENT_SIGN_IN_MINUTES = 10;

/** Deleting an account needs a sign-in from the last few minutes, not a forgotten old session. */
export function isRecentSignIn(sessionCreatedAt: Date, now = new Date()) {
  return now.getTime() - sessionCreatedAt.getTime() <= RECENT_SIGN_IN_MINUTES * 60_000;
}
```

В `create-auth.ts` — перед `return betterAuth(...)` объяви ссылку на `getSession` (функция замыкается на экземпляр, который ещё не создан):

```ts
  let getSession: (headers: Headers) => Promise<{ session: { createdAt: Date } } | null> = async () =>
    null;
```

в объект `betterAuth({...})`:

```ts
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (_user, request) => {
          const current = request ? await getSession(request.headers) : null;
          if (!current || !isRecentSignIn(new Date(current.session.createdAt))) {
            throw new APIError('FORBIDDEN', { message: 'Sign in again', code: REAUTH_REQUIRED });
          }
        },
      },
    },
```

и вместо `return betterAuth({...})`:

```ts
  const instance = betterAuth({ /* …как раньше… */ });
  getSession = (headers) => instance.api.getSession({ headers });
  return instance;
```

Если `request` в `beforeDelete` при вызове через `auth.api.deleteUser({ headers })` приходит `undefined`, бери сессию так: в хуке `before` (Task 7) для `ctx.path === '/delete-user'` проверяй `getSessionFromCtx(ctx)` и `isRecentSignIn` там же — и тогда `beforeDelete` не нужен. Выбери вариант, при котором оба теста проходят.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && bun test && cd ../.. && bun run check-types`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api apps/web/src/features/song apps/web/messages
git commit -m "Let users delete their account and keep their arrangements as anonymous"
```

---

### Task 9: Профиль на сервере

**Files:**
- Create: `apps/api/src/services/profile.ts`
- Create: `apps/api/src/trpc/routers/profile.ts`; Modify: `apps/api/src/trpc/router.ts`
- Test: `apps/api/src/services/profile.test.ts`

**Interfaces:**
- Consumes: `toListItem`, `WITH_DETAILS` (`services/arrangements.ts`), `isPlaceholderEmail`, `saveArrangement`, `setLike`, `setSave`.
- Produces:
  - `type Profile = { id: string; username: string; name: string; image: string | null; createdAt: Date; stats: { arrangements: number; likes: number; saves: number }; isMe: boolean }`
  - `profileById(db, userId: string, viewerId?: string): Promise<Profile>`, `profileByUsername(db, username: string, viewerId?: string): Promise<Profile>` (NOT_FOUND, если нет)
  - `type ProfileArrangement = ArrangementListItem & { status: 'draft' | 'published'; createdAt: Date }`
  - `profileArrangements(db, params: { userId: string; viewerId?: string; cursor?: string | null; limit?: number }): Promise<{ items: ProfileArrangement[]; nextCursor: string | null }>`
  - tRPC: `profile.me` (protected), `profile.byUsername({ username })`, `profile.arrangements({ userId, cursor? })`

- [ ] **Step 1: Write the failing test**

`apps/api/src/services/profile.test.ts`:

```ts
import { beforeEach, describe, expect, test } from 'bun:test';
import { eq } from 'drizzle-orm';

import type { Database } from '../db';
import { arrangement, user } from '../db/schema';
import { noopSearch } from '../search';
import { createTestDb, createUser } from '../test/db';
import { profileArrangements, profileByUsername } from './profile';
import { saveArrangement } from './save-arrangement';
import { setLike, setSave } from './social';

let db: Database;

async function create(authorId: string, title: string) {
  const saved = await saveArrangement(db, noopSearch, {
    authorId,
    input: {
      artist: { name: 'LUMEN' },
      song: { title },
      content: '${Am}la',
      rhythms: [],
      capo: null,
      tempo: null,
      key: null,
      notes: '',
      tuning: 'standard',
      voicings: {},
      zenMode: null,
    },
  });
  return saved.id;
}

beforeEach(async () => {
  db = await createTestDb();
  await createUser(db, 'alice');
  await createUser(db, 'bob');
  await db.update(user).set({ username: 'alice' }).where(eq(user.id, 'alice'));
});

describe('profileByUsername', () => {
  test('counts published arrangements and what others did with them', async () => {
    const first = await create('alice', 'Гореть');
    const draft = await create('alice', 'Черновик');
    await db.update(arrangement).set({ status: 'draft' }).where(eq(arrangement.id, draft));
    await setLike(db, 'bob', first, true);
    await setSave(db, 'bob', first, true);
    await setLike(db, 'bob', draft, true);

    const profile = await profileByUsername(db, 'alice', 'bob');
    expect(profile).toMatchObject({
      id: 'alice',
      username: 'alice',
      stats: { arrangements: 1, likes: 1, saves: 1 },
      isMe: false,
    });
    expect((await profileByUsername(db, 'ALICE', 'alice')).isMe).toBe(true);
  });

  test('unknown username is not found', async () => {
    await expect(profileByUsername(db, 'nobody')).rejects.toThrow();
  });
});

describe('profileArrangements', () => {
  test('drafts only for the owner, newest first, paged', async () => {
    const a = await create('alice', 'A');
    await Bun.sleep(5);
    const b = await create('alice', 'B');
    await Bun.sleep(5);
    const c = await create('alice', 'C');
    await db.update(arrangement).set({ status: 'draft' }).where(eq(arrangement.id, c));

    const asBob = await profileArrangements(db, { userId: 'alice', viewerId: 'bob' });
    expect(asBob.items.map((item) => item.id)).toEqual([b, a]);

    const page1 = await profileArrangements(db, { userId: 'alice', viewerId: 'alice', limit: 2 });
    expect(page1.items.map((item) => item.id)).toEqual([c, b]);
    const page2 = await profileArrangements(db, {
      userId: 'alice',
      viewerId: 'alice',
      limit: 2,
      cursor: page1.nextCursor,
    });
    expect(page2.items.map((item) => item.id)).toEqual([a]);
    expect(page2.nextCursor).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && bun test src/services/profile.test.ts`
Expected: FAIL — `Cannot find module './profile'`.

- [ ] **Step 3: Write minimal implementation**

`apps/api/src/services/profile.ts`:

```ts
import { TRPCError } from '@trpc/server';
import { and, eq, sql } from 'drizzle-orm';

import type { Database } from '../db';
import { arrangement, user } from '../db/schema';
import { type ArrangementListItem, toListItem, WITH_DETAILS } from './arrangements';

export type Profile = {
  id: string;
  username: string;
  name: string;
  image: string | null;
  createdAt: Date;
  stats: { arrangements: number; likes: number; saves: number };
  isMe: boolean;
};

export type ProfileArrangement = ArrangementListItem & {
  status: 'draft' | 'published';
  createdAt: Date;
};

async function toProfile(
  db: Database,
  row: typeof user.$inferSelect | undefined,
  viewerId: string | undefined,
): Promise<Profile> {
  if (!row?.username) {
    throw new TRPCError({ code: 'NOT_FOUND' });
  }
  const [stats] = await db
    .select({
      arrangements: sql<number>`count(*)::int`,
      likes: sql<number>`coalesce(sum(${arrangement.likeCount}), 0)::int`,
      saves: sql<number>`coalesce(sum(${arrangement.saveCount}), 0)::int`,
    })
    .from(arrangement)
    .where(and(eq(arrangement.authorId, row.id), eq(arrangement.status, 'published')));
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    image: row.image,
    createdAt: row.createdAt,
    stats: stats ?? { arrangements: 0, likes: 0, saves: 0 },
    isMe: viewerId === row.id,
  };
}

export async function profileById(db: Database, userId: string, viewerId?: string) {
  const [row] = await db.select().from(user).where(eq(user.id, userId));
  return toProfile(db, row, viewerId);
}

export async function profileByUsername(db: Database, username: string, viewerId?: string) {
  const [row] = await db.select().from(user).where(eq(user.username, username.toLowerCase()));
  return toProfile(db, row, viewerId);
}

/** The cursor is `<createdAt ISO>|<id>` of the last item: ties on time still page correctly. */
export async function profileArrangements(
  db: Database,
  params: { userId: string; viewerId?: string; cursor?: string | null; limit?: number },
) {
  const { userId, viewerId, cursor, limit = 20 } = params;
  const [cursorTime, cursorId] = cursor ? cursor.split('|') : [];
  const rows = await db.query.arrangement.findMany({
    where: {
      authorId: userId,
      ...(viewerId === userId ? {} : { status: 'published' }),
      ...(cursorTime && cursorId
        ? {
            OR: [
              { createdAt: { lt: new Date(cursorTime) } },
              { createdAt: new Date(cursorTime), id: { lt: cursorId } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'desc', id: 'desc' },
    limit: limit + 1,
    with: WITH_DETAILS,
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    items: page.map(
      (row): ProfileArrangement => ({ ...toListItem(row), status: row.status, createdAt: row.createdAt }),
    ),
    nextCursor: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}
```

Если relational `where` Drizzle 1.0 RC не принимает такой `OR`, сделай выборку id через `db.select().from(arrangement).where(and(..., or(lt(...), and(eq(...), lt(...)))))` и подгрузи строки через `db.query.arrangement.findMany({ where: { id: { in: ids } }, with: WITH_DETAILS })` в том же порядке (как `inOrder` в `arrangements.ts`).

`apps/api/src/trpc/routers/profile.ts`:

```ts
import { z } from 'zod';

import { profileArrangements, profileById, profileByUsername } from '../../services/profile';
import { protectedProcedure, publicProcedure, router } from '../init';

export const profileRouter = router({
  me: protectedProcedure.query(({ ctx }) =>
    profileById(ctx.db, ctx.session.user.id, ctx.session.user.id),
  ),
  byUsername: publicProcedure
    .input(z.object({ username: z.string().min(1).max(30) }))
    .query(({ ctx, input }) => profileByUsername(ctx.db, input.username, ctx.session?.user.id)),
  arrangements: publicProcedure
    .input(z.object({ userId: z.string(), cursor: z.string().nullish() }))
    .query(({ ctx, input }) =>
      profileArrangements(ctx.db, { ...input, viewerId: ctx.session?.user.id }),
    ),
});
```

В `router.ts` добавить `profile: profileRouter,`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && bun test && bun run check-types`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/profile.ts apps/api/src/services/profile.test.ts apps/api/src/trpc
git commit -m "Serve user profiles with arrangement stats"
```

---

### Task 10: Новый экран входа в вебе (провайдеры и код на почту)

**Files:**
- Modify: `apps/web/package.json` (`@better-auth/passkey@1.7.6`)
- Modify: `apps/web/src/lib/auth-client.ts`
- Create: `apps/web/src/features/auth/otp.ts`, `apps/web/src/features/auth/auth-errors.ts`, `apps/web/src/features/auth/placeholder-email.ts`, `apps/web/src/features/auth/use-auth-methods.ts`
- Create: `apps/web/src/features/auth/provider-buttons.tsx`, `apps/web/src/features/auth/email-code-form.tsx`
- Modify: `apps/web/src/features/auth/auth-sheet.tsx` (весь `AuthForm`), `apps/web/src/features/auth/account-button.tsx`
- Modify: `apps/web/messages/ru.json`, `apps/web/messages/en.json` (раздел `auth`)
- Test: `apps/web/src/features/auth/otp.test.ts`, `apps/web/src/features/auth/auth-errors.test.ts`

**Interfaces:**
- Consumes: tRPC `auth.methods` (Task 7), эндпоинты Better Auth (Tasks 3–7).
- Produces:
  - `authClient` с `emailOTPClient`, `usernameClient`, `oneTimeTokenClient`, `passkeyClient` (no `genericOAuthClient` in 1.7.6 — Yandex goes through `signIn.social`/`linkSocial`); каждый запрос шлёт `x-locale`
  - `normalizeOtp(value: string): string`, `OTP_LENGTH = 6`
  - `authErrorKey(error: { code?: string; status?: number } | string | null | undefined): AuthErrorKey`, `type AuthErrorKey = 'wrongCode' | 'codeExpired' | 'tooManyAttempts' | 'mailFailed' | 'accountNotLinked' | 'lastMethod' | 'telegramTaken' | 'reauth' | 'failed'`
  - `isPlaceholderEmail(email: string): boolean` (веб-копия, тот же домен `users.invalid`)
  - `useAuthMethods()` — `useQuery` на `auth.methods`
  - `signInWithProvider(provider: ProviderId, callbackURL: string): Promise<void>` (в `provider-buttons.tsx`)
  - `<ProviderButtons onTelegram={() => void} />`, `<EmailCodeForm onDone={() => void} />`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/features/auth/otp.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { normalizeOtp } from './otp';

describe('normalizeOtp', () => {
  test('keeps digits only, at most six', () => {
    expect(normalizeOtp('123 456')).toBe('123456');
    expect(normalizeOtp('123-456')).toBe('123456');
    expect(normalizeOtp('Код: 654321.')).toBe('654321');
    expect(normalizeOtp('1234567')).toBe('123456');
    expect(normalizeOtp('12a')).toBe('12');
  });
});
```

`apps/web/src/features/auth/auth-errors.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { authErrorKey } from './auth-errors';

describe('authErrorKey', () => {
  test('maps Better Auth and our codes', () => {
    expect(authErrorKey({ code: 'INVALID_OTP' })).toBe('wrongCode');
    expect(authErrorKey({ code: 'OTP_EXPIRED' })).toBe('codeExpired');
    expect(authErrorKey({ code: 'TOO_MANY_ATTEMPTS' })).toBe('tooManyAttempts');
    expect(authErrorKey({ code: 'MAIL_FAILED' })).toBe('mailFailed');
    expect(authErrorKey({ code: 'LAST_SIGN_IN_METHOD' })).toBe('lastMethod');
    expect(authErrorKey({ code: 'TELEGRAM_ALREADY_LINKED' })).toBe('telegramTaken');
    expect(authErrorKey({ code: 'REAUTH_REQUIRED' })).toBe('reauth');
  });

  test('maps the OAuth redirect error for an existing email', () => {
    expect(authErrorKey('account_not_linked')).toBe('accountNotLinked');
  });

  test('anything else is a generic failure', () => {
    expect(authErrorKey({ code: 'SOMETHING' })).toBe('failed');
    expect(authErrorKey(null)).toBe('failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/web && bun test src/features/auth`
Expected: FAIL — модули не найдены.

- [ ] **Step 3: Pure helpers**

`apps/web/src/features/auth/otp.ts`:

```ts
export const OTP_LENGTH = 6;

/** Codes get pasted as «123 456» or «Код: 123456»; only the digits matter. */
export function normalizeOtp(value: string) {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}
```

`apps/web/src/features/auth/auth-errors.ts`:

```ts
export type AuthErrorKey =
  | 'wrongCode'
  | 'codeExpired'
  | 'tooManyAttempts'
  | 'mailFailed'
  | 'accountNotLinked'
  | 'lastMethod'
  | 'telegramTaken'
  | 'reauth'
  | 'failed';

const BY_CODE: Record<string, AuthErrorKey> = {
  INVALID_OTP: 'wrongCode',
  OTP_EXPIRED: 'codeExpired',
  TOO_MANY_ATTEMPTS: 'tooManyAttempts',
  MAIL_FAILED: 'mailFailed',
  LAST_SIGN_IN_METHOD: 'lastMethod',
  TELEGRAM_ALREADY_LINKED: 'telegramTaken',
  REAUTH_REQUIRED: 'reauth',
  // OAuth redirects back with `?error=account_not_linked` when the email has an account that
  // cannot be joined automatically (e.g. VK, or a former password user who never confirmed it).
  account_not_linked: 'accountNotLinked',
  ACCOUNT_NOT_LINKED: 'accountNotLinked',
};

/** A message key under `auth.errors` for a Better Auth error object or an OAuth `?error=` value. */
export function authErrorKey(
  error: { code?: string; status?: number } | string | null | undefined,
): AuthErrorKey {
  const code = typeof error === 'string' ? error : error?.code;
  return (code && BY_CODE[code]) || 'failed';
}
```

Сверь коды `INVALID_OTP`, `OTP_EXPIRED`, `TOO_MANY_ATTEMPTS` с `node_modules/better-auth/dist/plugins/email-otp/error-codes.mjs` и поправь словарь, если названия другие.

`apps/web/src/features/auth/placeholder-email.ts`:

```ts
/** Same domain as the API's placeholder addresses: accounts without a real email. */
export function isPlaceholderEmail(email: string | null | undefined) {
  return !email || email.endsWith('@users.invalid');
}
```

- [ ] **Step 4: Auth client**

```bash
cd apps/web && bun add @better-auth/passkey@1.7.6
```

`apps/web/src/lib/auth-client.ts` (весь файл):

```ts
import { passkeyClient } from '@better-auth/passkey/client';
import {
  emailOTPClient,
  oneTimeTokenClient,
  usernameClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { API_URL, authToken } from './api';

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    emailOTPClient(),
    usernameClient(),
    oneTimeTokenClient(),
    passkeyClient(),
  ],
  fetchOptions: {
    auth: {
      type: 'Bearer',
      token: () => authToken.get() ?? '',
    },
    // The code email is written in the interface language, not the browser's.
    onRequest: (context) => {
      if (typeof document !== 'undefined') {
        context.headers.set('x-locale', document.documentElement.lang);
      }
      return context;
    },
    onSuccess: (context) => {
      const token = context.response.headers.get('set-auth-token');
      if (token) {
        authToken.set(token);
      }
    },
  },
});
```

`apps/web/src/features/auth/use-auth-methods.ts`:

```ts
'use client';

import { useQuery } from '@tanstack/react-query';

import { useTRPC } from '@/lib/trpc';

export function useAuthMethods() {
  const trpc = useTRPC();
  return useQuery({ ...trpc.auth.methods.queryOptions(), staleTime: Number.POSITIVE_INFINITY });
}
```

- [ ] **Step 5: Messages**

Раздел `auth` в `messages/ru.json` заменить на:

```json
  "auth": {
    "signIn": "Войти",
    "signOut": "Выйти",
    "account": "Аккаунт",
    "profile": "Профиль",
    "title": "Вход",
    "description": "Чтобы сохранять и редактировать свои разборы.",
    "orEmail": "или по почте",
    "email": "Почта",
    "getCode": "Получить код",
    "codeSent": "Код отправлен на {email}",
    "code": "Код из письма",
    "resend": "Отправить ещё раз",
    "resendIn": "Отправить ещё раз через {seconds} с",
    "changeEmail": "Изменить почту",
    "passkey": "Войти с passkey",
    "providers": {
      "yandex": "Яндекс",
      "vk": "VK",
      "telegram": "Telegram",
      "google": "Google"
    },
    "continueWith": "Войти через {provider}",
    "errors": {
      "wrongCode": "Неверный код.",
      "codeExpired": "Код устарел, запросите новый.",
      "tooManyAttempts": "Слишком много попыток, запросите новый код.",
      "mailFailed": "Не получилось отправить письмо. Попробуйте войти другим способом.",
      "accountNotLinked": "Аккаунт с этой почтой уже есть. Войдите кодом на почту, а потом привяжите сервис в профиле.",
      "lastMethod": "Это последний способ входа — сначала добавьте другой.",
      "telegramTaken": "Этот Telegram уже привязан к другому аккаунту.",
      "reauth": "Войдите ещё раз, чтобы подтвердить.",
      "failed": "Не получилось. Попробуйте ещё раз."
    }
  },
```

`messages/en.json` — те же ключи:

```json
  "auth": {
    "signIn": "Sign in",
    "signOut": "Sign out",
    "account": "Account",
    "profile": "Profile",
    "title": "Sign in",
    "description": "To save and edit your arrangements.",
    "orEmail": "or with email",
    "email": "Email",
    "getCode": "Get a code",
    "codeSent": "We sent a code to {email}",
    "code": "Code from the email",
    "resend": "Send again",
    "resendIn": "Send again in {seconds} s",
    "changeEmail": "Change email",
    "passkey": "Sign in with a passkey",
    "providers": {
      "yandex": "Yandex",
      "vk": "VK",
      "telegram": "Telegram",
      "google": "Google"
    },
    "continueWith": "Continue with {provider}",
    "errors": {
      "wrongCode": "Wrong code.",
      "codeExpired": "The code has expired, ask for a new one.",
      "tooManyAttempts": "Too many attempts, ask for a new code.",
      "mailFailed": "We couldn't send the email. Try another way to sign in.",
      "accountNotLinked": "An account with this email already exists. Sign in with an email code, then link the service in your profile.",
      "lastMethod": "This is your last way to sign in — add another one first.",
      "telegramTaken": "This Telegram account is linked to another user.",
      "reauth": "Sign in again to confirm.",
      "failed": "That didn't work. Try again."
    }
  },
```

- [ ] **Step 6: Provider buttons**

`apps/web/src/features/auth/provider-buttons.tsx`:

```tsx
'use client';

import type { ProviderId } from '@chordtune/api';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { isCapacitor } from '@/features/song/links';
import { authClient } from '@/lib/auth-client';
import { startNativeSignIn } from './native-sign-in';
import { useAuthMethods } from './use-auth-methods';

/** Full-page redirect on the web; the system browser in the app (Task 12). */
export async function signInWithProvider(provider: ProviderId, callbackURL: string) {
  if (isCapacitor) {
    await startNativeSignIn({ provider });
    return;
  }
  if (provider !== 'telegram') {
    // Yandex is a genericOAuth provider, which Better Auth 1.7 serves through `signIn.social` too.
    await authClient.signIn.social({ provider, callbackURL, errorCallbackURL: callbackURL });
  }
}

export function ProviderButtons({ onTelegram }: { onTelegram: () => void }) {
  const t = useTranslations('auth');
  const methods = useAuthMethods();
  const providers = methods.data?.providers ?? [];
  if (providers.length === 0) {
    return null;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {providers.map((provider) => (
        <Button
          key={provider}
          variant="outline"
          size="lg"
          onClick={() =>
            provider === 'telegram' && !isCapacitor
              ? onTelegram()
              : signInWithProvider(provider, window.location.href)
          }
        >
          {t('providers.' + provider)}
        </Button>
      ))}
    </div>
  );
}
```

В `apps/api/src/exports.ts` добавить типовой экспорт: `export type { ProviderId, AuthMethods } from './auth/config';`.

`startNativeSignIn` появится в Task 12. Чтобы этот шаг компилировался, создай сейчас `apps/web/src/features/auth/native-sign-in.ts` с заглушкой, которую Task 12 заменит целиком:

```ts
import type { ProviderId } from '@chordtune/api';

export async function startNativeSignIn(_params: { provider: ProviderId }): Promise<void> {
  throw new Error('Native sign-in is not wired yet');
}
```

- [ ] **Step 7: Email code form**

`apps/web/src/features/auth/email-code-form.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authClient } from '@/lib/auth-client';
import { authErrorKey } from './auth-errors';
import { normalizeOtp, OTP_LENGTH } from './otp';

const RESEND_SECONDS = 60;

export function EmailCodeForm({ onDone }: { onDone: () => Promise<void> | void }) {
  const t = useTranslations('auth');
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) {
      return;
    }
    const timer = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async (to: string) => {
    setPending(true);
    setError(null);
    const result = await authClient.emailOtp.sendVerificationOtp({ email: to, type: 'sign-in' });
    setPending(false);
    if (result.error) {
      setError(t(`errors.${authErrorKey(result.error)}`));
      return;
    }
    setSentTo(to);
    setCode('');
    setWait(RESEND_SECONDS);
  };

  const verify = async (otp: string) => {
    if (!sentTo) {
      return;
    }
    setPending(true);
    setError(null);
    const result = await authClient.signIn.emailOtp({ email: sentTo, otp });
    setPending(false);
    if (result.error) {
      setError(t(`errors.${authErrorKey(result.error)}`));
      return;
    }
    await onDone();
  };

  if (!sentTo) {
    return (
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          send(email.trim());
        }}
      >
        <Label htmlFor="auth-email">{t('email')}</Label>
        <Input
          id="auth-email"
          type="email"
          required
          // `webauthn` lets the browser offer saved passkeys right in this field.
          autoComplete="email webauthn"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
        <Button type="submit" size="lg" disabled={pending}>
          {t('getCode')}
        </Button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">{t('codeSent', { email: sentTo })}</p>
      <Label htmlFor="auth-code">{t('code')}</Label>
      <Input
        id="auth-code"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={OTP_LENGTH + 4}
        className="text-center font-mono text-2xl tracking-[0.5em]"
        value={code}
        disabled={pending}
        onChange={(event) => {
          const next = normalizeOtp(event.target.value);
          setCode(next);
          if (next.length === OTP_LENGTH) {
            verify(next);
          }
        }}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
      <div className="flex justify-between text-sm">
        <Button variant="link" size="sm" className="px-0" onClick={() => setSentTo(null)}>
          {t('changeEmail')}
        </Button>
        <Button
          variant="link"
          size="sm"
          className="px-0"
          disabled={wait > 0 || pending}
          onClick={() => send(sentTo)}
        >
          {wait > 0 ? t('resendIn', { seconds: wait }) : t('resend')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Rewrite the sheet**

`apps/web/src/features/auth/auth-sheet.tsx` — убрать `MODES`, вкладки и парольную форму; контекст становится `() => void`:

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { authErrorKey } from './auth-errors';
import { EmailCodeForm } from './email-code-form';
import { signInWithPasskey } from './passkeys';
import { ProviderButtons } from './provider-buttons';
import { openTelegramLogin } from './telegram-login';
import { useAuthMethods } from './use-auth-methods';
import { useSession } from './use-session';

const AuthSheetContext = createContext<() => void>(() => {});

/** Opens the sign-in sheet from anywhere, e.g. when saving without an account. */
export function useAuthSheet() {
  return useContext(AuthSheetContext);
}

export function AuthSheetProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const show = useCallback(() => setOpen(true), []);

  // OAuth comes back with `?error=…` on failure: reopen the sheet and say why.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (!oauthError) {
      return;
    }
    params.delete('error');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
    setError(oauthError);
    setOpen(true);
  }, []);

  return (
    <AuthSheetContext.Provider value={show}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-xl sm:mb-8 sm:rounded-xl">
          <AuthForm initialError={error} onDone={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </AuthSheetContext.Provider>
  );
}

function AuthForm({ initialError, onDone }: { initialError: string | null; onDone: () => void }) {
  const t = useTranslations('auth');
  const queryClient = useQueryClient();
  const session = useSession();
  const methods = useAuthMethods();
  const [error, setError] = useState(initialError ? t(`errors.${authErrorKey(initialError)}`) : null);

  const finish = async () => {
    await session.refetch();
    await queryClient.invalidateQueries();
    onDone();
  };

  const run = async (action: () => Promise<{ error?: { code?: string } | null } | void>) => {
    setError(null);
    const result = await action();
    if (result && result.error) {
      setError(t(`errors.${authErrorKey(result.error)}`));
      return;
    }
    if (result) {
      await finish();
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 pt-0">
      <SheetHeader className="px-0">
        <SheetTitle>{t('title')}</SheetTitle>
        <SheetDescription>{t('description')}</SheetDescription>
      </SheetHeader>
      <ProviderButtons
        onTelegram={() =>
          methods.data?.telegramBot && run(() => openTelegramLogin(methods.data.telegramBot!.id))
        }
      />
      <Button variant="outline" size="lg" onClick={() => run(signInWithPasskey)}>
        <KeyRound />
        {t('passkey')}
      </Button>
      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <Separator className="flex-1" />
        {t('orEmail')}
        <Separator className="flex-1" />
      </div>
      {error && <p className="text-destructive text-sm">{error}</p>}
      <EmailCodeForm onDone={finish} />
    </div>
  );
}
```

`signInWithPasskey` и `openTelegramLogin` появятся в Tasks 13 и 11; чтобы шаг компилировался, создай сейчас заглушки, которые эти задачи заменят целиком:

`apps/web/src/features/auth/passkeys.ts`:

```ts
export async function signInWithPasskey(): Promise<{ error?: { code?: string } | null } | void> {
  return { error: { code: 'NOT_READY' } };
}
```

`apps/web/src/features/auth/telegram-login.ts`:

```ts
export async function openTelegramLogin(
  _botId: string,
): Promise<{ error?: { code?: string } | null } | void> {
  return { error: { code: 'NOT_READY' } };
}
```

Найди вызовы `openAuth('sign-up')` / `useAuthSheet()(mode)`: `grep -rn "useAuthSheet\|openAuth(" apps/web/src` — аргумент режима убрать.

- [ ] **Step 9: Account button**

В `account-button.tsx`: показывать `user.image` в круге 28px, если есть (иначе `UserRound`); скрывать email через `isPlaceholderEmail(user.email)`; добавить в поповер ссылку «Профиль» перед `ThemeSwitcher`:

```tsx
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          nativeButton={false}
          render={<Link href="/profile" />}
        >
          <UserRound />
          {t('profile')}
        </Button>
```

(`Link` из `@/i18n/navigation`.) Строку email заменить на `{!isPlaceholderEmail(user.email) && <span …>{user.email}</span>}`.

- [ ] **Step 10: Run checks**

Run: `cd apps/web && bun test src/features/auth && cd ../.. && bun run check-types && bun run lint`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web apps/api/src/exports.ts bun.lock
git commit -m "Sign in on the web with providers or an email code"
```

---

### Task 11: Telegram в вебе

**Files:**
- Modify: `apps/web/src/features/auth/telegram-login.ts` (весь файл)

**Interfaces:**
- Consumes: `POST /api/auth/telegram/sign-in`, `POST /api/auth/telegram/link` (Task 6), `authClient.$fetch`.
- Produces:
  - `openTelegramLogin(botId: string): Promise<{ error?: { code?: string } | null } | void>` — вход
  - `linkTelegram(botId: string): Promise<{ error?: { code?: string } | null } | void>` — привязка (Task 16)
  - `requestTelegramAuth(botId: string): Promise<Record<string, unknown> | null>` — `null`, если окно закрыли

- [ ] **Step 1: Implement**

`apps/web/src/features/auth/telegram-login.ts`:

```ts
import { authClient } from '@/lib/auth-client';

type TelegramWidget = {
  Login: {
    auth: (
      options: { bot_id: string; request_access?: string; lang?: string },
      callback: (data: Record<string, unknown> | false) => void,
    ) => void;
  };
};

declare global {
  interface Window {
    Telegram?: TelegramWidget;
  }
}

const SCRIPT = 'https://telegram.org/js/telegram-widget.js?22';
let loading: Promise<TelegramWidget> | null = null;

/** The widget script, loaded once on first use rather than on every page. */
function loadWidget(): Promise<TelegramWidget> {
  if (window.Telegram?.Login) {
    return Promise.resolve(window.Telegram);
  }
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () =>
      window.Telegram?.Login ? resolve(window.Telegram) : reject(new Error('No Telegram widget'));
    script.onerror = () => {
      loading = null;
      reject(new Error('Telegram widget failed to load'));
    };
    document.head.append(script);
  });
  return loading;
}

/** Opens Telegram's own popup from our button; resolves with the signed fields or null if closed. */
export async function requestTelegramAuth(botId: string) {
  const widget = await loadWidget();
  return new Promise<Record<string, unknown> | null>((resolve) => {
    widget.Login.auth({ bot_id: botId, lang: document.documentElement.lang }, (data) =>
      resolve(data || null),
    );
  });
}

export async function openTelegramLogin(botId: string) {
  const data = await requestTelegramAuth(botId).catch(() => null);
  if (!data) {
    return;
  }
  return authClient.$fetch('/telegram/sign-in', { method: 'POST', body: data });
}

export async function linkTelegram(botId: string) {
  const data = await requestTelegramAuth(botId).catch(() => null);
  if (!data) {
    return;
  }
  return authClient.$fetch('/telegram/link', { method: 'POST', body: data });
}
```

Закрытое окно Telegram возвращает `undefined` из `openTelegramLogin` — `AuthForm.run` (Task 10) ничего не делает, шторка остаётся открытой.

- [ ] **Step 2: Run checks**

Run: `bun run check-types && bun run lint`
Expected: PASS.

- [ ] **Step 3: Manual check (пользователь)**

С `TELEGRAM_BOT_TOKEN`/`TELEGRAM_BOT_NAME` и доменом бота через `/setdomain` (для локальной проверки нужен публичный домен, например туннель): «Telegram» в шторке открывает окно Telegram, после подтверждения — вход, имя и аватарка из Telegram.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/features/auth/telegram-login.ts
git commit -m "Sign in with Telegram on the web"
```

---

### Task 12: Вход в приложениях через системный браузер

**Files:**
- Modify: `apps/web/package.json` (`@capacitor/browser@^8`, `@capacitor/app@^8`)
- Create: `apps/web/src/features/auth/mobile-link.ts`
- Modify: `apps/web/src/features/auth/native-sign-in.ts` (весь файл)
- Create: `apps/web/src/features/auth/mobile-auth.tsx` (клиентская часть страниц браузера)
- Create: `apps/web/src/app/[locale]/auth/mobile/page.web.tsx`, `apps/web/src/app/[locale]/auth/mobile/done/page.web.tsx`
- Modify: `apps/web/src/components/providers.tsx` (слушатель deep link)
- Modify: `apps/web/ios/App/App/Info.plist`, `apps/web/android/app/src/main/AndroidManifest.xml`
- Test: `apps/web/src/features/auth/mobile-link.test.ts`

**Interfaces:**
- Consumes: `/api/auth/one-time-token/*` (Task 7), `signInWithProvider` (Task 10), `requestTelegramAuth` не используется — в браузере Telegram идёт редиректом.
- Produces:
  - `DEEP_LINK_PREFIX = 'app.chordtune://auth'`
  - `type PendingAuth = { state: string; mode: 'sign-in' | 'link'; provider: ProviderId; createdAt: number }`
  - `createPendingAuth(mode, provider, now?): PendingAuth`, `PENDING_TTL_MS = 600_000`
  - `parseAuthLink(url: string): { state: string; token: string | null; linked: string | null; error: string | null } | null`
  - `matchPendingAuth(pending: PendingAuth | null, link: { state: string }, now?: number): boolean`
  - `mobileStartUrl(params: { origin: string; locale: string; provider: ProviderId; state: string; mode: 'sign-in' | 'link'; ott?: string }): string`
  - `startNativeSignIn(params: { provider: ProviderId; mode?: 'sign-in' | 'link' }): Promise<void>`
  - `listenForAuthLinks(onSignedIn: () => void, onLinked: (provider: string) => void, onError: (code: string) => void): () => void`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/auth/mobile-link.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import {
  createPendingAuth,
  matchPendingAuth,
  mobileStartUrl,
  PENDING_TTL_MS,
  parseAuthLink,
} from './mobile-link';

describe('parseAuthLink', () => {
  test('reads token, linked provider and error', () => {
    expect(parseAuthLink('app.chordtune://auth?token=t1&state=s1')).toEqual({
      state: 's1',
      token: 't1',
      linked: null,
      error: null,
    });
    expect(parseAuthLink('app.chordtune://auth?linked=vk&state=s2')?.linked).toBe('vk');
    expect(parseAuthLink('app.chordtune://auth?error=access_denied&state=s3')?.error).toBe(
      'access_denied',
    );
  });

  test('ignores other links and links without state', () => {
    expect(parseAuthLink('app.chordtune://song?id=1')).toBeNull();
    expect(parseAuthLink('https://evil.example/auth?token=t&state=s')).toBeNull();
    expect(parseAuthLink('app.chordtune://auth?token=t')).toBeNull();
  });
});

describe('matchPendingAuth', () => {
  test('state must match and be fresh — even after the app restarts', () => {
    const pending = createPendingAuth('sign-in', 'google', 1_000);
    expect(pending.state).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(matchPendingAuth(pending, { state: pending.state }, 2_000)).toBe(true);
    expect(matchPendingAuth(pending, { state: 'other' }, 2_000)).toBe(false);
    expect(matchPendingAuth(pending, { state: pending.state }, 1_000 + PENDING_TTL_MS + 1)).toBe(
      false,
    );
    expect(matchPendingAuth(null, { state: pending.state }, 2_000)).toBe(false);
  });
});

describe('mobileStartUrl', () => {
  test('points the browser at the web page with everything it needs', () => {
    expect(
      mobileStartUrl({
        origin: 'https://chordtune.app',
        locale: 'ru',
        provider: 'yandex',
        state: 's',
        mode: 'link',
        ott: 'o',
      }),
    ).toBe('https://chordtune.app/ru/auth/mobile?provider=yandex&state=s&mode=link&ott=o');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/features/auth/mobile-link.test.ts`
Expected: FAIL — модуль не найден.

- [ ] **Step 3: Pure module**

`apps/web/src/features/auth/mobile-link.ts`:

```ts
import type { ProviderId } from '@chordtune/api';

export const DEEP_LINK_PREFIX = 'app.chordtune://auth';
export const PENDING_TTL_MS = 10 * 60_000;
const PENDING_KEY = 'chordtune.pending-auth';

export type PendingAuth = {
  state: string;
  mode: 'sign-in' | 'link';
  provider: ProviderId;
  createdAt: number;
};

export function createPendingAuth(
  mode: PendingAuth['mode'],
  provider: ProviderId,
  now = Date.now(),
): PendingAuth {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const state = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  return { state, mode, provider, createdAt: now };
}

export function parseAuthLink(url: string) {
  if (!url.startsWith(DEEP_LINK_PREFIX)) {
    return null;
  }
  const query = url.slice(DEEP_LINK_PREFIX.length).replace(/^\/?\?/, '');
  const params = new URLSearchParams(query);
  const state = params.get('state');
  if (!state) {
    return null;
  }
  return {
    state,
    token: params.get('token'),
    linked: params.get('linked'),
    error: params.get('error'),
  };
}

/** A link only counts if the app started this flow recently; anything else could be injected. */
export function matchPendingAuth(
  pending: PendingAuth | null,
  link: { state: string },
  now = Date.now(),
) {
  return Boolean(pending && pending.state === link.state && now - pending.createdAt <= PENDING_TTL_MS);
}

export function mobileStartUrl(params: {
  origin: string;
  locale: string;
  provider: ProviderId;
  state: string;
  mode: 'sign-in' | 'link';
  ott?: string;
}) {
  const query = new URLSearchParams({
    provider: params.provider,
    state: params.state,
    mode: params.mode,
    ...(params.ott ? { ott: params.ott } : {}),
  });
  return `${params.origin}/${params.locale}/auth/mobile?${query}`;
}

/** localStorage, not sessionStorage: Android may kill the app while the browser is open. */
export const pendingAuthStore = {
  get(): PendingAuth | null {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      return raw ? (JSON.parse(raw) as PendingAuth) : null;
    } catch {
      return null;
    }
  },
  set(value: PendingAuth | null) {
    try {
      if (value) {
        localStorage.setItem(PENDING_KEY, JSON.stringify(value));
      } else {
        localStorage.removeItem(PENDING_KEY);
      }
    } catch {
      // storage can be unavailable
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/web && bun test src/features/auth/mobile-link.test.ts`
Expected: PASS.

- [ ] **Step 5: Native side**

```bash
cd apps/web && bun add @capacitor/browser@^8 @capacitor/app@^8
```

`apps/web/src/features/auth/native-sign-in.ts` (весь файл):

```ts
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import type { ProviderId } from '@chordtune/api';

import { API_URL, authToken } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import {
  createPendingAuth,
  matchPendingAuth,
  mobileStartUrl,
  parseAuthLink,
  pendingAuthStore,
} from './mobile-link';

/**
 * Opens the provider in the system browser via our web page. Linking needs the user's session in
 * that browser, so the app hands it over as a one-time token.
 */
export async function startNativeSignIn({
  provider,
  mode = 'sign-in',
}: {
  provider: ProviderId;
  mode?: 'sign-in' | 'link';
}) {
  const pending = createPendingAuth(mode, provider);
  pendingAuthStore.set(pending);
  let ott: string | undefined;
  if (mode === 'link') {
    const { data } = await authClient.oneTimeToken.generate();
    ott = data?.token;
  }
  await Browser.open({
    url: mobileStartUrl({
      origin: API_URL,
      locale: document.documentElement.lang,
      provider,
      state: pending.state,
      mode,
      ott,
    }),
    presentationStyle: 'popover',
  });
}

export function listenForAuthLinks(
  onSignedIn: () => void,
  onLinked: (provider: string) => void,
  onError: (code: string) => void,
) {
  const handle = App.addListener('appUrlOpen', async ({ url }) => {
    const link = parseAuthLink(url);
    if (!link) {
      return;
    }
    const pending = pendingAuthStore.get();
    if (!matchPendingAuth(pending, link)) {
      return;
    }
    pendingAuthStore.set(null);
    await Browser.close().catch(() => {});
    if (link.error) {
      onError(link.error);
    } else if (link.token) {
      const { data, error } = await authClient.oneTimeToken.verify({ token: link.token });
      if (error || !data) {
        onError(error?.code ?? 'failed');
        return;
      }
      authToken.set(data.session.token);
      onSignedIn();
    } else if (link.linked) {
      onLinked(link.linked);
    }
  });
  return () => {
    handle.then((listener) => listener.remove());
  };
}
```

`API_URL` в Capacitor-сборке — публичный адрес (`NEXT_PUBLIC_API_URL`), и веб-страницы Next обслуживаются с того же домена в Docker-образе — поэтому стартовая страница строится от него.

- [ ] **Step 6: Browser pages (web build only)**

`apps/web/src/features/auth/mobile-auth.tsx`:

```tsx
'use client';

import type { ProviderId } from '@chordtune/api';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { authClient } from '@/lib/auth-client';
import { DEEP_LINK_PREFIX } from './mobile-link';

function back(params: Record<string, string>) {
  window.location.replace(`${DEEP_LINK_PREFIX}?${new URLSearchParams(params)}`);
}

/** Step one in the system browser: start OAuth (after taking over the app's session to link). */
export function MobileAuthStart({
  provider,
  state,
  mode,
  ott,
  telegramBot,
}: {
  provider: ProviderId;
  state: string;
  mode: 'sign-in' | 'link';
  ott: string | null;
  telegramBot: string | null;
}) {
  const t = useTranslations('auth');
  const started = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    (async () => {
      if (mode === 'link' && ott) {
        const { error } = await authClient.oneTimeToken.verify({ token: ott });
        if (error) {
          back({ state, error: error.code ?? 'failed' });
          return;
        }
      }
      const done = `${window.location.origin}${window.location.pathname}/done?${new URLSearchParams({ state, mode, provider })}`;
      if (provider === 'telegram') {
        // Redirect mode: popups are unreliable inside Custom Tabs and Safari View Controller.
        if (!telegramBot) {
          back({ state, error: 'failed' });
          return;
        }
        const origin = window.location.origin;
        window.location.replace(
          `https://oauth.telegram.org/auth?${new URLSearchParams({ bot_id: telegramBot, origin, return_to: done })}`,
        );
        return;
      }
      const options = { callbackURL: done, errorCallbackURL: done };
      const result =
        mode === 'link'
          ? await authClient.linkSocial({ provider, ...options })
          : await authClient.signIn.social({ provider, ...options });
      if (result?.error) {
        setMessage(t('errors.failed'));
        back({ state, error: result.error.code ?? 'failed' });
      }
    })();
  }, [mode, ott, provider, state, telegramBot, t]);

  return <p className="p-8 text-center text-muted-foreground">{message ?? t('redirecting')}</p>;
}

/** Step two: the provider is done; hand the app a one-time token or say the link worked. */
export function MobileAuthDone({
  state,
  mode,
  provider,
}: {
  state: string;
  mode: 'sign-in' | 'link';
  provider: ProviderId;
}) {
  const t = useTranslations('auth');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const oauthError = params.get('error');
      if (oauthError) {
        back({ state, error: oauthError });
        return;
      }
      if (provider === 'telegram' && window.location.hash.includes('tgAuthResult=')) {
        const encoded = window.location.hash.split('tgAuthResult=')[1] ?? '';
        const data = JSON.parse(atob(encoded.replaceAll('-', '+').replaceAll('_', '/')));
        const path = mode === 'link' ? '/telegram/link' : '/telegram/sign-in';
        const { error } = await authClient.$fetch(path, { method: 'POST', body: data });
        if (error) {
          back({ state, error: (error as { code?: string }).code ?? 'failed' });
          return;
        }
      }
      if (mode === 'link') {
        back({ state, linked: provider });
        return;
      }
      const { data, error } = await authClient.oneTimeToken.generate();
      back(error || !data ? { state, error: 'failed' } : { state, token: data.token });
    })();
  }, [mode, provider, state]);

  return <p className="p-8 text-center text-muted-foreground">{t('returning')}</p>;
}
```

Формат возврата Telegram (`#tgAuthResult=<base64url JSON>`) проверь по актуальной документации Telegram (`core.telegram.org/widgets/login`) и по живому ответу; если он другой — поправь разбор, проверка подписи на сервере не меняется.

Добавить в `auth` в обоих `messages/*.json`: `"redirecting": "Открываем вход…"` / `"Opening sign-in…"`, `"returning": "Возвращаемся в приложение…"` / `"Returning to the app…"`.

`apps/web/src/app/[locale]/auth/mobile/page.web.tsx`:

```tsx
import { notFound } from 'next/navigation';

import { MobileAuthStart } from '@/features/auth/mobile-auth';
import { resolveLocale } from '@/i18n/params';
import { serverTrpc } from '@/lib/trpc-server';

// Route types are generated for `page.tsx` only, so the props of this web-only page are typed by hand.
type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const PROVIDERS = ['yandex', 'vk', 'telegram', 'google'] as const;

export default async function MobileAuthPage({ params, searchParams }: Props) {
  await resolveLocale(params);
  const { provider, state, mode = 'sign-in', ott = null } = await searchParams;
  const known = PROVIDERS.find((id) => id === provider);
  if (!known || !state || (mode !== 'sign-in' && mode !== 'link')) {
    notFound();
  }
  const methods = await serverTrpc.auth.methods.query();
  return (
    <MobileAuthStart
      provider={known}
      state={state}
      mode={mode}
      ott={ott}
      telegramBot={methods.telegramBot?.id ?? null}
    />
  );
}
```

`apps/web/src/app/[locale]/auth/mobile/done/page.web.tsx`:

```tsx
import { notFound } from 'next/navigation';

import { MobileAuthDone } from '@/features/auth/mobile-auth';
import { resolveLocale } from '@/i18n/params';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
};

const PROVIDERS = ['yandex', 'vk', 'telegram', 'google'] as const;

export default async function MobileAuthDonePage({ params, searchParams }: Props) {
  await resolveLocale(params);
  const { provider, state, mode = 'sign-in' } = await searchParams;
  const known = PROVIDERS.find((id) => id === provider);
  if (!known || !state || (mode !== 'sign-in' && mode !== 'link')) {
    notFound();
  }
  return <MobileAuthDone state={state} mode={mode} provider={known} />;
}
```

- [ ] **Step 7: Listen in the app**

`apps/web/src/components/providers.tsx` — добавить компонент внутри `AuthSheetProvider`, рядом с `<OfflineSync />`:

```tsx
                {isCapacitor && <NativeAuthLinks />}
```

`NativeAuthLinks` положи в `apps/web/src/features/auth/native-auth-links.tsx`:

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { useToast } from '@/components/toast';
import { authErrorKey } from './auth-errors';
import { listenForAuthLinks } from './native-sign-in';
import { useSession } from './use-session';

/** Finishes sign-in and linking when the system browser comes back by deep link. */
export function NativeAuthLinks() {
  const t = useTranslations('auth');
  const toast = useToast();
  const session = useSession();
  const queryClient = useQueryClient();

  useEffect(
    () =>
      listenForAuthLinks(
        async () => {
          await session.refetch();
          await queryClient.invalidateQueries();
        },
        async () => {
          await queryClient.invalidateQueries();
        },
        (code) => toast(t(`errors.${authErrorKey(code)}`)),
      ),
    [queryClient, session, t, toast],
  );

  return null;
}
```

Сверь сигнатуру `useToast()` с `components/toast.tsx` и подстрой вызов.

- [ ] **Step 8: Deep link scheme in native projects**

`apps/web/ios/App/App/Info.plist` — внутри корневого `<dict>`:

```xml
	<key>CFBundleURLTypes</key>
	<array>
		<dict>
			<key>CFBundleURLName</key>
			<string>app.chordtune</string>
			<key>CFBundleURLSchemes</key>
			<array>
				<string>app.chordtune</string>
			</array>
		</dict>
	</array>
```

`apps/web/android/app/src/main/AndroidManifest.xml` — в `<activity android:name=".MainActivity" …>` после существующего `intent-filter`:

```xml
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="app.chordtune" android:host="auth" />
            </intent-filter>
```

Run: `cd apps/web && bun run cap:sync`
Expected: синхронизация без ошибок, плагины `@capacitor/app` и `@capacitor/browser` в выводе.

- [ ] **Step 9: Run checks**

Run: `bun run test && bun run check-types && bun run lint && cd apps/web && bun run build:cap`
Expected: PASS; `build:cap` не содержит страниц `auth/mobile` (они `page.web.tsx`).

- [ ] **Step 10: Commit**

```bash
git add apps/web bun.lock
git commit -m "Sign in from the mobile app through the system browser"
```

---

### Task 13: Passkeys (веб и приложения)

**Files:**
- Modify: `apps/web/src/features/auth/passkeys.ts` (весь файл)
- Modify: `apps/web/next.config.ts` (`pageExtensions` веба: добавить `web.ts`)
- Create: `apps/web/src/app/.well-known/apple-app-site-association/route.web.ts`
- Create: `apps/web/src/app/.well-known/assetlinks.json/route.web.ts`
- Create: нативный плагин — см. Step 3
- Modify: `apps/web/ios/App/App/App.entitlements` (создать, если нет), `apps/web/android/app/src/main/res/values/strings.xml` / `AndroidManifest.xml` (`asset_statements`)

**Interfaces:**
- Consumes: эндпоинты `/api/auth/passkey/*` (Task 7), `useAuthMethods` (Task 10).
- Produces:
  - `passkeySupported(methods: AuthMethods | undefined): boolean`
  - `signInWithPasskey(): Promise<{ error?: { code?: string } | null } | void>`
  - `addPasskey(name?: string): Promise<{ error?: { code?: string } | null } | void>`
  - нативный плагин `NativePasskey` с методами `create({ options: string }): Promise<{ response: string }>` и `get({ options: string }): Promise<{ response: string }>` (JSON WebAuthn в обе стороны)

- [ ] **Step 1: Choose the native plugin**

Поищи поддерживаемый плагин passkeys для Capacitor 8:

```bash
npm search capacitor passkey --json | head -c 4000
```

Критерии: поддержка Capacitor 8, iOS через `ASAuthorizationPlatformPublicKeyCredentialProvider`, Android через Credential Manager (`androidx.credentials`), принимает и возвращает WebAuthn JSON (`PublicKeyCredentialCreationOptionsJSON` / `RegistrationResponseJSON`), обновлялся за последний год. Если подходит — используй его и подстрой Step 4 под его API, записав название и версию в коммит. Если нет — Step 3.

- [ ] **Step 2: Domain association files**

`apps/web/next.config.ts`: `pageExtensions: buildTarget === 'web' ? ['web.tsx', 'web.ts', 'tsx', 'ts'] : ['tsx', 'ts'],` и обнови комментарий над ним: «`page.web.tsx` and `route.web.ts` only exist in the web build».

`apps/web/src/app/.well-known/apple-app-site-association/route.web.ts`:

```ts
/** Lets the iOS app use passkeys of this domain. Read at request time from the server env. */
export function GET() {
  const team = process.env.APPLE_TEAM_ID;
  if (!team) {
    return new Response('Not found', { status: 404 });
  }
  return Response.json({ webcredentials: { apps: [`${team}.app.chordtune`] } });
}
```

`apps/web/src/app/.well-known/assetlinks.json/route.web.ts`:

```ts
/** Lets the Android app use passkeys of this domain. Read at request time from the server env. */
export function GET() {
  const fingerprint = process.env.ANDROID_CERT_SHA256;
  if (!fingerprint) {
    return new Response('Not found', { status: 404 });
  }
  return Response.json([
    {
      relation: ['delegate_permission/common.get_login_creds'],
      target: {
        namespace: 'android_app',
        package_name: 'app.chordtune',
        sha256_cert_fingerprints: [fingerprint.toUpperCase()],
      },
    },
  ]);
}
```

Обе функции должны быть динамическими (env читается в рантайме): если Next пытается пререндерить их при сборке, добавь `export const dynamic = 'force-dynamic';`.

- [ ] **Step 3: Local native plugin (только если Step 1 ничего не нашёл)**

Структура — локальный пакет в workspace, подключаемый как обычный Capacitor-плагин:

```
apps/web/native-plugins/passkey/
  package.json            # name "@chordtune/capacitor-passkey", capacitor.ios/android пути
  src/index.ts            # registerPlugin<NativePasskeyPlugin>('NativePasskey')
  ios/Sources/NativePasskeyPlugin/NativePasskeyPlugin.swift
  ChordtuneCapacitorPasskey.podspec / Package.swift
  android/build.gradle
  android/src/main/java/app/chordtune/passkey/NativePasskeyPlugin.kt
```

Сгенерируй каркас официальным генератором, а не руками:

```bash
cd apps/web/native-plugins && npm init @capacitor/plugin@latest passkey -- --name @chordtune/capacitor-passkey --package-id app.chordtune.passkey --class-name NativePasskey --repo none --license MIT --description "Passkeys for ChordTune" --author ChordTune
```

`src/definitions.ts`:

```ts
export interface NativePasskeyPlugin {
  /** `options` — PublicKeyCredentialCreationOptionsJSON; returns RegistrationResponseJSON. */
  create(params: { options: string }): Promise<{ response: string }>;
  /** `options` — PublicKeyCredentialRequestOptionsJSON; returns AuthenticationResponseJSON. */
  get(params: { options: string }): Promise<{ response: string }>;
}
```

Android (`NativePasskeyPlugin.kt`) — Credential Manager принимает WebAuthn JSON как есть:

```kotlin
package app.chordtune.passkey

import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

@CapacitorPlugin(name = "NativePasskey")
class NativePasskeyPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.Main)

    @PluginMethod
    fun create(call: PluginCall) {
        val options = call.getString("options") ?: return call.reject("options required")
        scope.launch {
            try {
                val result = CredentialManager.create(activity).createCredential(
                    activity, CreatePublicKeyCredentialRequest(options)
                ) as CreatePublicKeyCredentialResponse
                call.resolve(JSObject().put("response", result.registrationResponseJson))
            } catch (error: Exception) {
                call.reject(error.message ?: "create failed", error)
            }
        }
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val options = call.getString("options") ?: return call.reject("options required")
        scope.launch {
            try {
                val result = CredentialManager.create(activity).getCredential(
                    activity, GetCredentialRequest(listOf(GetPublicKeyCredentialOption(options)))
                )
                val credential = result.credential as PublicKeyCredential
                call.resolve(JSObject().put("response", credential.authenticationResponseJson))
            } catch (error: Exception) {
                call.reject(error.message ?: "get failed", error)
            }
        }
    }
}
```

В `android/build.gradle` плагина: `implementation "androidx.credentials:credentials:1.5.0"`, `implementation "androidx.credentials:credentials-play-services-auth:1.5.0"`, `implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0"` (проверь актуальные версии в Android Studio).

iOS (`NativePasskeyPlugin.swift`) — `ASAuthorization` работает с байтами, поэтому WebAuthn JSON разбирается и собирается вручную (base64url без `=`):

```swift
import AuthenticationServices
import Capacitor
import Foundation

@objc(NativePasskeyPlugin)
public class NativePasskeyPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding
{
    public let identifier = "NativePasskeyPlugin"
    public let jsName = "NativePasskey"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "create", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
    ]
    private var pending: CAPPluginCall?

    @objc func create(_ call: CAPPluginCall) {
        guard let options = parse(call),
            let challenge = decode(options["challenge"] as? String),
            let rp = options["rp"] as? [String: Any], let rpId = rp["id"] as? String,
            let user = options["user"] as? [String: Any], let name = user["name"] as? String,
            let userId = decode(user["id"] as? String)
        else { return call.reject("Bad registration options") }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        perform(provider.createCredentialRegistrationRequest(challenge: challenge, name: name, userID: userId), call)
    }

    @objc func get(_ call: CAPPluginCall) {
        guard let options = parse(call), let challenge = decode(options["challenge"] as? String),
            let rpId = options["rpId"] as? String
        else { return call.reject("Bad authentication options") }
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(relyingPartyIdentifier: rpId)
        let request = provider.createCredentialAssertionRequest(challenge: challenge)
        if let allow = options["allowCredentials"] as? [[String: Any]] {
            request.allowedCredentials = allow.compactMap { decode($0["id"] as? String) }
                .map { ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0) }
        }
        perform(request, call)
    }

    private func perform(_ request: ASAuthorizationRequest, _ call: CAPPluginCall) {
        pending = call
        DispatchQueue.main.async {
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.webView?.window ?? ASPresentationAnchor()
    }

    public func authorizationController(
        controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization
    ) {
        guard let call = pending else { return }
        pending = nil
        let json: [String: Any]
        switch authorization.credential {
        case let credential as ASAuthorizationPlatformPublicKeyCredentialRegistration:
            let id = encode(credential.credentialID)
            json = [
                "id": id, "rawId": id, "type": "public-key", "authenticatorAttachment": "platform",
                "clientExtensionResults": [String: Any](),
                "response": [
                    "clientDataJSON": encode(credential.rawClientDataJSON),
                    "attestationObject": encode(credential.rawAttestationObject ?? Data()),
                    "transports": ["internal", "hybrid"],
                ],
            ]
        case let credential as ASAuthorizationPlatformPublicKeyCredentialAssertion:
            let id = encode(credential.credentialID)
            json = [
                "id": id, "rawId": id, "type": "public-key", "authenticatorAttachment": "platform",
                "clientExtensionResults": [String: Any](),
                "response": [
                    "clientDataJSON": encode(credential.rawClientDataJSON),
                    "authenticatorData": encode(credential.rawAuthenticatorData),
                    "signature": encode(credential.signature),
                    "userHandle": encode(credential.userID),
                ],
            ]
        default:
            return call.reject("Unexpected credential")
        }
        guard let data = try? JSONSerialization.data(withJSONObject: json),
            let string = String(data: data, encoding: .utf8)
        else { return call.reject("Encoding failed") }
        call.resolve(["response": string])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        pending?.reject(error.localizedDescription, nil, error)
        pending = nil
    }

    private func parse(_ call: CAPPluginCall) -> [String: Any]? {
        guard let text = call.getString("options"), let data = text.data(using: .utf8) else { return nil }
        return (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    }

    private func decode(_ value: String?) -> Data? {
        guard var text = value else { return nil }
        text = text.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while text.count % 4 != 0 { text += "=" }
        return Data(base64Encoded: text)
    }

    private func encode(_ data: Data) -> String {
        data.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }
}
```

Минимальная версия iOS для passkeys — 16; если у проекта ниже, оберни тело методов в `if #available(iOS 16.0, *)` и отклоняй вызов иначе. Собери в Xcode.

Подключение: `cd apps/web && bun add ./native-plugins/passkey && bun run cap:sync`.

- [ ] **Step 4: Web module**

`apps/web/src/features/auth/passkeys.ts` (весь файл; если в Step 1 выбран сторонний плагин — подставь его импорт и имена методов):

```ts
import type { AuthMethods } from '@chordtune/api';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { isCapacitor } from '@/features/song/links';
import { authClient } from '@/lib/auth-client';

type NativePasskey = {
  create(params: { options: string }): Promise<{ response: string }>;
  get(params: { options: string }): Promise<{ response: string }>;
};

const NativePasskey = registerPlugin<NativePasskey>('NativePasskey');

type Result = { error?: { code?: string } | null } | void;

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
  const { data: options, error } = await authClient.$fetch<unknown>(
    '/passkey/generate-authenticate-options',
    { method: 'GET' },
  );
  if (error) {
    return { error };
  }
  try {
    const { response } = await NativePasskey.get({ options: JSON.stringify(options) });
    return authClient.$fetch('/passkey/verify-authentication', {
      method: 'POST',
      body: { response: JSON.parse(response) },
    });
  } catch {
    return; // the user closed the system sheet
  }
}

export async function addPasskey(name?: string): Promise<Result> {
  if (!isCapacitor) {
    return authClient.passkey.addPasskey({ name });
  }
  const { data: options, error } = await authClient.$fetch<unknown>(
    '/passkey/generate-register-options',
    { method: 'GET', query: name ? { name } : {} },
  );
  if (error) {
    return { error };
  }
  try {
    const { response } = await NativePasskey.create({ options: JSON.stringify(options) });
    return authClient.$fetch('/passkey/verify-registration', {
      method: 'POST',
      body: { response: JSON.parse(response), name },
    });
  } catch {
    return;
  }
}
```

Сверь методы и тела `generate-*`/`verify-*` с `node_modules/@better-auth/passkey/dist/index.d.mts` (метод `GET`/`POST`, поле `response`) и поправь.

В `auth-sheet.tsx`: кнопку passkey показывай только при `passkeySupported(methods.data)`, и в `AuthForm` включи подсказку passkey в поле email (conditional UI, только веб):

```tsx
  useEffect(() => {
    if (isCapacitor || !window.PublicKeyCredential?.isConditionalMediationAvailable) {
      return;
    }
    let active = true;
    window.PublicKeyCredential.isConditionalMediationAvailable().then(async (available) => {
      if (!available || !active) {
        return;
      }
      // Resolves only when the user picks a passkey from the email field's suggestions.
      const result = await authClient.signIn.passkey({ autoFill: true });
      if (active && result && !result.error) {
        await finish();
      }
    });
    return () => {
      active = false;
    };
  }, []);
```

(`finish` объяви через `useCallback` или подавь линтеру `// biome-ignore lint/correctness/useExhaustiveDependencies: runs once per sheet` — запуск должен быть один раз на открытие шторки.)

- [ ] **Step 5: Associate the app with the domain**

iOS: в Xcode → target App → Signing & Capabilities → «+ Associated Domains» → `webcredentials:<домен>` (создаст `App.entitlements`). Домен — из `PUBLIC_URL`; для разных окружений — отдельная запись на каждое.

Android: `res/values/strings.xml`:

```xml
<string name="asset_statements" translatable="false">[{\"include\": \"https://chordtune.example.com/.well-known/assetlinks.json\"}]</string>
```

и в `<application>` манифеста:

```xml
        <meta-data android:name="asset_statements" android:resource="@string/asset_statements" />
```

Домен в `asset_statements` подставляется при сборке: в `release.yml` перед сборкой APK замени `chordtune.example.com` на хост из `PUBLIC_URL` (`sed -i`), локально — оставь пример.

- [ ] **Step 6: Run checks**

Run: `bun run test && bun run check-types && bun run lint && cd apps/web && bun run build && bun run build:cap`
Expected: PASS; `curl http://localhost:3000/.well-known/assetlinks.json` при заданном `ANDROID_CERT_SHA256` отдаёт JSON, без него — 404.

- [ ] **Step 7: Manual check (пользователь)**

Веб: «Войти с passkey» после добавления passkey в профиле (Task 16). Android: APK с ключом из `ANDROID_CERT_SHA256`, домен с HTTPS и `assetlinks.json` — системное окно passkey при входе. iOS — только с платным аккаунтом и `APPLE_TEAM_ID`.

- [ ] **Step 8: Commit**

```bash
git add apps/web .github bun.lock
git commit -m "Sign in with passkeys on the web and in the apps"
```

---

### Task 14: Страница профиля

**Files:**
- Create: `apps/web/src/features/profile/profile-view.tsx`, `apps/web/src/features/profile/avatar.tsx`, `apps/web/src/features/profile/links.ts`
- Create: `apps/web/src/app/[locale]/profile/page.tsx` (мой профиль)
- Create: `apps/web/src/app/[locale]/u/page.tsx` (Capacitor и запасной: `?name=`), `apps/web/src/app/[locale]/u/[name]/page.web.tsx` (SSR)
- Modify: `apps/web/src/features/song/song-view.tsx` (автор — ссылка), `apps/web/src/lib/trpc.ts` (типы)
- Modify: `apps/web/messages/*.json` (раздел `profile`)
- Test: `apps/web/src/features/profile/links.test.ts`

**Interfaces:**
- Consumes: tRPC `profile.me`, `profile.byUsername`, `profile.arrangements` (Task 9), `SongCard` (`features/songs/song-card.tsx`), `useAuthSheet`.
- Produces:
  - `profileHref(username: string): string | { pathname: '/u'; query: { name: string } }`
  - `type Profile = RouterOutputs['profile']['me']` в `lib/trpc.ts`
  - `<ProfileView profile={Profile} />`, `<Avatar name image size />`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/profile/links.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { profileHrefFor } from './links';

describe('profileHrefFor', () => {
  test('web gets a path, Capacitor a query', () => {
    expect(profileHrefFor('vasya', false)).toBe('/u/vasya');
    expect(profileHrefFor('vasya', true)).toEqual({ pathname: '/u', query: { name: 'vasya' } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/features/profile`
Expected: FAIL.

- [ ] **Step 3: Links**

`apps/web/src/features/profile/links.ts`:

```ts
import { isCapacitor } from '@/features/song/links';

/** The static Capacitor build has no per-user pages, so it reads the username from the query. */
export function profileHrefFor(username: string, capacitor: boolean) {
  return capacitor ? { pathname: '/u' as const, query: { name: username } } : `/u/${username}`;
}

export function profileHref(username: string) {
  return profileHrefFor(username, isCapacitor);
}
```

Run: `cd apps/web && bun test src/features/profile` — PASS.

- [ ] **Step 4: Messages**

`messages/ru.json`:

```json
  "profile": {
    "title": "Профиль",
    "edit": "Редактировать",
    "security": "Безопасность",
    "since": "На сайте с {date}",
    "arrangements": "{count, plural, one {# разбор} few {# разбора} many {# разборов} other {# разбора}}",
    "likes": "{count, plural, one {# лайк} few {# лайка} many {# лайков} other {# лайка}}",
    "saves": "{count, plural, one {# сохранение} few {# сохранения} many {# сохранений} other {# сохранения}}",
    "draft": "Черновик",
    "empty": "Пока нет разборов.",
    "more": "Показать ещё",
    "notFound": "Пользователь не найден"
  },
```

`messages/en.json`:

```json
  "profile": {
    "title": "Profile",
    "edit": "Edit",
    "security": "Security",
    "since": "Joined {date}",
    "arrangements": "{count, plural, one {# arrangement} other {# arrangements}}",
    "likes": "{count, plural, one {# like} other {# likes}}",
    "saves": "{count, plural, one {# save} other {# saves}}",
    "draft": "Draft",
    "empty": "No arrangements yet.",
    "more": "Show more",
    "notFound": "User not found"
  },
```

- [ ] **Step 5: Components**

`apps/web/src/lib/trpc.ts` — добавить: `export type Profile = RouterOutputs['profile']['me'];`

`apps/web/src/features/profile/avatar.tsx`:

```tsx
import { cn } from '@/lib/utils';

export function Avatar({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null | undefined;
  className?: string;
}) {
  if (image) {
    // Provider avatars come from many hosts; next/image would need each one configured.
    // biome-ignore lint/performance/noImgElement: see above
    return <img src={image} alt="" className={cn('rounded-full object-cover', className)} />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        'flex items-center justify-center rounded-full bg-surface-2 font-semibold text-muted-foreground',
        className,
      )}
    >
      {(name.trim()[0] ?? '?').toUpperCase()}
    </span>
  );
}
```

`apps/web/src/features/profile/profile-view.tsx`:

```tsx
'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { Pencil, Shield } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SongCard } from '@/features/songs/song-card';
import { Link } from '@/i18n/navigation';
import { type Profile, useTRPC } from '@/lib/trpc';
import { Avatar } from './avatar';

export function ProfileView({ profile }: { profile: Profile }) {
  const t = useTranslations('profile');
  const format = useFormatter();
  const trpc = useTRPC();
  const list = useInfiniteQuery(
    trpc.profile.arrangements.infiniteQueryOptions(
      { userId: profile.id },
      { getNextPageParam: (page) => page.nextCursor },
    ),
  );
  const items = list.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
      <header className="flex items-center gap-4">
        <Avatar name={profile.name} image={profile.image} className="size-20 text-2xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h1 className="truncate font-display font-semibold text-2xl">{profile.name}</h1>
          <span className="text-muted-foreground">@{profile.username}</span>
          <span className="text-muted-foreground text-xs">
            {t('since', { date: format.dateTime(profile.createdAt, { year: 'numeric', month: 'long' }) })}
          </span>
        </div>
        {profile.isMe && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('edit')}
              nativeButton={false}
              render={<Link href="/profile/edit" />}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('security')}
              nativeButton={false}
              render={<Link href="/profile/security" />}
            >
              <Shield />
            </Button>
          </div>
        )}
      </header>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span>{t('arrangements', { count: profile.stats.arrangements })}</span>
        <span>{t('likes', { count: profile.stats.likes })}</span>
        <span>{t('saves', { count: profile.stats.saves })}</span>
      </div>

      {list.isSuccess && items.length === 0 && (
        <p className="text-muted-foreground">{t('empty')}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <SongCard
            key={item.id}
            item={item}
            badge={item.status === 'draft' ? <Badge variant="secondary">{t('draft')}</Badge> : undefined}
          />
        ))}
      </div>
      {list.hasNextPage && (
        <Button variant="outline" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
          {t('more')}
        </Button>
      )}
    </div>
  );
}
```

`SongCard` принимает `ArrangementListItem`; `ProfileArrangement` его расширяет — совместимо. Если `badge` у `SongCard` рендерится иначе, чем ожидалось, сверь с `library-view.tsx`.

- [ ] **Step 6: Pages**

`apps/web/src/app/[locale]/profile/page.tsx`:

```tsx
import { MyProfile } from '@/features/profile/my-profile';
import { resolveLocale } from '@/i18n/params';

export default async function ProfilePage({ params }: PageProps<'/[locale]/profile'>) {
  await resolveLocale(params);
  return <MyProfile />;
}
```

`apps/web/src/features/profile/my-profile.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthSheet } from '@/features/auth/auth-sheet';
import { useSession } from '@/features/auth/use-session';
import { useTRPC } from '@/lib/trpc';
import { ProfileView } from './profile-view';

export function MyProfile() {
  const trpc = useTRPC();
  const session = useSession();
  const openAuth = useAuthSheet();
  const signedIn = Boolean(session.data?.user);
  const profile = useQuery({ ...trpc.profile.me.queryOptions(), enabled: signedIn });

  useEffect(() => {
    if (!session.isPending && !signedIn) {
      openAuth();
    }
  }, [openAuth, session.isPending, signedIn]);

  return profile.data ? <ProfileView profile={profile.data} /> : null;
}
```

`apps/web/src/app/[locale]/u/page.tsx` (Capacitor и любой билд, `?name=`):

```tsx
import { Suspense } from 'react';

import { ProfileByQuery } from '@/features/profile/profile-by-name';
import { resolveLocale } from '@/i18n/params';

export default async function UserByQueryPage({ params }: PageProps<'/[locale]/u'>) {
  await resolveLocale(params);
  return (
    <Suspense>
      <ProfileByQuery />
    </Suspense>
  );
}
```

`apps/web/src/features/profile/profile-by-name.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { useTRPC } from '@/lib/trpc';
import { ProfileView } from './profile-view';

export function ProfileByQuery() {
  const t = useTranslations('profile');
  const trpc = useTRPC();
  const name = useSearchParams().get('name') ?? '';
  const profile = useQuery({ ...trpc.profile.byUsername.queryOptions({ username: name }), enabled: Boolean(name) });
  if (profile.isError || !name) {
    return <p className="p-8 text-center text-muted-foreground">{t('notFound')}</p>;
  }
  return profile.data ? <ProfileView profile={profile.data} /> : null;
}
```

`apps/web/src/app/[locale]/u/[name]/page.web.tsx`:

```tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';

import { ProfileView } from '@/features/profile/profile-view';
import { resolveLocale } from '@/i18n/params';
import { serverTrpc } from '@/lib/trpc-server';

// Route types are generated for `page.tsx` only, so the params of this web-only page are typed by hand.
type Props = { params: Promise<{ locale: string; name: string }> };

const loadProfile = cache(async (username: string) => {
  try {
    return await serverTrpc.profile.byUsername.query({ username });
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const profile = await loadProfile(name);
  return profile
    ? {
        title: `${profile.name} (@${profile.username})`,
        openGraph: { title: profile.name, images: profile.image ? [profile.image] : [] },
      }
    : {};
}

export default async function UserPage({ params }: Props) {
  await resolveLocale(params);
  const { name } = await params;
  const profile = await loadProfile(name);
  if (!profile) {
    notFound();
  }
  // Server-rendered for link previews; `isMe` is false here and the client view refines nothing.
  return <ProfileView profile={profile} />;
}
```

SSR-запрос идёт без сессии, поэтому `isMe` на этой странице всегда `false`, а черновики не видны — своё редактирование владелец открывает через `/profile`. Это соответствует спеке (чужой профиль — только опубликованное).

- [ ] **Step 7: Author link on the song page**

`song-view.tsx:195`:

```tsx
          <span>
            {arrangement.author?.username ? (
              <Link href={profileHref(arrangement.author.username)} className="underline-offset-4 hover:underline">
                {t('by', { name: arrangement.author.name })}
              </Link>
            ) : (
              t('by', { name: arrangement.author?.name ?? t('anonymous') })
            )}
          </span>
```

(`Link` из `@/i18n/navigation`, `profileHref` из `@/features/profile/links`.)

- [ ] **Step 8: Run checks**

Run: `bun run test && bun run check-types && bun run lint && cd apps/web && bun run build && bun run build:cap`
Expected: PASS; в `out/` есть `ru/profile/index.html` и `ru/u/index.html`, нет `u/[name]`.

- [ ] **Step 9: Commit**

```bash
git add apps/web
git commit -m "Show user profiles with their arrangements"
```

---

### Task 15: Редактирование профиля

**Files:**
- Create: `apps/web/src/app/[locale]/profile/edit/page.tsx`, `apps/web/src/features/profile/profile-edit.tsx`
- Create: `apps/web/src/features/profile/username-input.ts`
- Modify: `apps/web/messages/*.json` (`profile.editForm`)
- Test: `apps/web/src/features/profile/username-input.test.ts`

**Interfaces:**
- Consumes: `authClient.updateUser`, `authClient.isUsernameAvailable` (плагин `username`, Task 4), `profile.me`.
- Produces:
  - `normalizeUsernameInput(value: string): string` — нижний регистр, только `[a-z0-9_]`, до 30
  - `usernameProblem(value: string): 'short' | 'reserved' | null` (зеркало серверных правил для подсказки; сервер всё равно проверяет)

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/profile/username-input.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { normalizeUsernameInput, usernameProblem } from './username-input';

describe('username input', () => {
  test('normalises as you type', () => {
    expect(normalizeUsernameInput('Vasya Pupkin!')).toBe('vasyapupkin');
    expect(normalizeUsernameInput('a'.repeat(40))).toHaveLength(30);
  });

  test('explains what is wrong', () => {
    expect(usernameProblem('ab')).toBe('short');
    expect(usernameProblem('admin')).toBe('reserved');
    expect(usernameProblem('vasya')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/features/profile/username-input.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/features/profile/username-input.ts`:

```ts
// Mirrors RESERVED_USERNAMES in apps/api/src/auth/username.ts for an early hint; the API decides.
const RESERVED = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'chordtune', 'edit', 'help', 'login', 'logout',
  'me', 'moderator', 'new', 'null', 'profile', 'root', 'security', 'settings', 'signin', 'signup',
  'support', 'system', 'u', 'undefined', 'user', 'users',
]);

export function normalizeUsernameInput(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
}

export function usernameProblem(value: string): 'short' | 'reserved' | null {
  if (value.length < 3) {
    return 'short';
  }
  return RESERVED.has(value) ? 'reserved' : null;
}
```

Messages — в `profile` добавить:

ru:
```json
    "editForm": {
      "title": "Редактировать профиль",
      "name": "Имя на сайте",
      "username": "Ник",
      "usernameHint": "Латиница, цифры и _, от 3 до 30 символов.",
      "short": "Слишком короткий ник.",
      "reserved": "Этот ник занят системой.",
      "taken": "Ник уже занят.",
      "available": "Ник свободен.",
      "save": "Сохранить",
      "saved": "Сохранено"
    }
```

en:
```json
    "editForm": {
      "title": "Edit profile",
      "name": "Display name",
      "username": "Username",
      "usernameHint": "Latin letters, digits and _, 3 to 30 characters.",
      "short": "Too short.",
      "reserved": "This username is reserved.",
      "taken": "Already taken.",
      "available": "Available.",
      "save": "Save",
      "saved": "Saved"
    }
```

`apps/web/src/features/profile/profile-edit.tsx`:

```tsx
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSession } from '@/features/auth/use-session';
import { useRouter } from '@/i18n/navigation';
import { authClient } from '@/lib/auth-client';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { useTRPC } from '@/lib/trpc';
import { normalizeUsernameInput, usernameProblem } from './username-input';

export function ProfileEdit() {
  const t = useTranslations('profile.editForm');
  const trpc = useTRPC();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useSession();
  const profile = useQuery({ ...trpc.profile.me.queryOptions(), enabled: Boolean(session.data) });
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (profile.data) {
      setName(profile.data.name);
      setUsername(profile.data.username);
    }
  }, [profile.data]);

  const checked = useDebouncedValue(username, 400);
  const problem = usernameProblem(username);
  const changed = profile.data && checked !== profile.data.username;
  const availability = useQuery({
    queryKey: ['username-available', checked],
    queryFn: async () => (await authClient.isUsernameAvailable({ username: checked })).data?.available ?? false,
    enabled: Boolean(changed) && !usernameProblem(checked),
  });

  const save = async () => {
    setPending(true);
    const result = await authClient.updateUser({ name: name.trim(), username });
    setPending(false);
    if (result.error) {
      toast(t('taken'));
      return;
    }
    await session.refetch();
    await queryClient.invalidateQueries();
    toast(t('saved'));
    router.push('/profile');
  };

  if (!profile.data) {
    return null;
  }
  const hint = problem
    ? t(problem)
    : changed && availability.data === false
      ? t('taken')
      : changed && availability.data
        ? t('available')
        : t('usernameHint');

  return (
    <form
      className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 py-6"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <h1 className="font-display font-semibold text-xl">{t('title')}</h1>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-name">{t('name')}</Label>
        <Input id="profile-name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="profile-username">{t('username')}</Label>
        <Input
          id="profile-username"
          autoCapitalize="none"
          autoCorrect="off"
          value={username}
          onChange={(e) => setUsername(normalizeUsernameInput(e.target.value))}
        />
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      <Button type="submit" size="lg" disabled={pending || Boolean(problem) || availability.data === false}>
        {t('save')}
      </Button>
    </form>
  );
}
```

Сверь `useDebouncedValue` с `lib/use-debounced-value.ts` (сигнатура) и `isUsernameAvailable` с клиентом `usernameClient` (возвращает `{ available: boolean }`).

`apps/web/src/app/[locale]/profile/edit/page.tsx`:

```tsx
import { ProfileEdit } from '@/features/profile/profile-edit';
import { resolveLocale } from '@/i18n/params';

export default async function ProfileEditPage({ params }: PageProps<'/[locale]/profile/edit'>) {
  await resolveLocale(params);
  return <ProfileEdit />;
}
```

- [ ] **Step 4: Run checks**

Run: `cd apps/web && bun test src/features/profile && cd ../.. && bun run check-types && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Edit the display name and username"
```

---

### Task 16: «Безопасность»: сессии, passkeys, сервисы, почта, удаление

**Files:**
- Create: `apps/web/src/features/profile/user-agent.ts`
- Create: `apps/web/src/features/profile/security-view.tsx`, `section.tsx`, `sessions-section.tsx`, `passkeys-section.tsx`, `providers-section.tsx`, `email-section.tsx`, `delete-account-section.tsx`
- Create: `apps/web/src/app/[locale]/profile/security/page.tsx`
- Modify: `apps/web/messages/*.json` (`security`)
- Test: `apps/web/src/features/profile/user-agent.test.ts`

**Interfaces:**
- Consumes: `authClient.listSessions/revokeSession/revokeOtherSessions/listAccounts/unlinkAccount/linkSocial/passkey.listUserPasskeys/passkey.deletePasskey/emailOtp.requestEmailChange/emailOtp.changeEmail/deleteUser`, `addPasskey`, `passkeySupported` (Task 13), `linkTelegram` (Task 11), `startNativeSignIn` (Task 12), `authErrorKey`, `isPlaceholderEmail`, `normalizeOtp`, `useAuthMethods`.
- Produces: `describeUserAgent(ua: string | null | undefined): { browser: string | null; os: string | null; mobile: boolean }`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/profile/user-agent.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { describeUserAgent } from './user-agent';

describe('describeUserAgent', () => {
  test('common browsers and systems', () => {
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      ),
    ).toEqual({ browser: 'Safari', os: 'macOS', mobile: false });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      ),
    ).toEqual({ browser: 'Chrome', os: 'Android', mobile: true });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      ),
    ).toEqual({ browser: 'Edge', os: 'Windows', mobile: false });
    expect(
      describeUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
      ),
    ).toEqual({ browser: null, os: 'iOS', mobile: true });
    expect(
      describeUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'),
    ).toEqual({ browser: 'Firefox', os: 'Linux', mobile: false });
  });

  test('unknown or missing', () => {
    expect(describeUserAgent(null)).toEqual({ browser: null, os: null, mobile: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/features/profile/user-agent.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the parser**

`apps/web/src/features/profile/user-agent.ts`:

```ts
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/YaBrowser\//, 'Yandex Browser'],
  [/OPR\//, 'Opera'],
  [/Firefox\//, 'Firefox'],
  [/Chrome\//, 'Chrome'],
  [/Version\/[\d.]+ .*Safari\//, 'Safari'],
];

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Android/, 'Android'],
  [/Mac OS X/, 'macOS'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
];

/** Enough to tell sessions apart in a list; not a full user-agent parser. Order matters. */
export function describeUserAgent(ua: string | null | undefined) {
  if (!ua) {
    return { browser: null, os: null, mobile: false };
  }
  return {
    browser: BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? null,
    os: SYSTEMS.find(([pattern]) => pattern.test(ua))?.[1] ?? null,
    mobile: /Mobile|iPhone|iPad|Android/.test(ua),
  };
}
```

Run: `cd apps/web && bun test src/features/profile/user-agent.test.ts` — PASS.

- [ ] **Step 4: Messages**

`messages/ru.json`:

```json
  "security": {
    "title": "Безопасность",
    "sessions": "Активные сессии",
    "thisDevice": "Это устройство",
    "unknownDevice": "Неизвестное устройство",
    "lastActive": "Активность: {date}",
    "revoke": "Завершить",
    "revokeOthers": "Завершить все остальные",
    "passkeys": "Passkeys",
    "addPasskey": "Добавить passkey",
    "noPasskeys": "Пока нет passkeys.",
    "delete": "Удалить",
    "services": "Вход через сервисы",
    "link": "Привязать",
    "unlink": "Отвязать",
    "lastMethodHint": "Последний способ входа — его нельзя убрать.",
    "email": "Почта",
    "addEmail": "Добавить почту",
    "sendCode": "Отправить код",
    "confirm": "Подтвердить",
    "emailTaken": "Эта почта привязана к другому аккаунту.",
    "deleteAccount": "Удалить аккаунт",
    "deleteWarning": "Аккаунт удалится навсегда. Опубликованные разборы останутся на сайте без автора, лайки и сохранения удалятся.",
    "deleteConfirm": "Удалить навсегда",
    "reauth": "Для удаления войдите ещё раз — это подтвердит, что аккаунт ваш."
  },
```

`messages/en.json`:

```json
  "security": {
    "title": "Security",
    "sessions": "Active sessions",
    "thisDevice": "This device",
    "unknownDevice": "Unknown device",
    "lastActive": "Last active: {date}",
    "revoke": "Sign out",
    "revokeOthers": "Sign out everywhere else",
    "passkeys": "Passkeys",
    "addPasskey": "Add a passkey",
    "noPasskeys": "No passkeys yet.",
    "delete": "Delete",
    "services": "Sign-in services",
    "link": "Link",
    "unlink": "Unlink",
    "lastMethodHint": "Your last way to sign in can't be removed.",
    "email": "Email",
    "addEmail": "Add an email",
    "sendCode": "Send code",
    "confirm": "Confirm",
    "emailTaken": "This email belongs to another account.",
    "deleteAccount": "Delete account",
    "deleteWarning": "Your account will be gone for good. Published arrangements stay on the site without an author; likes and saves are removed.",
    "deleteConfirm": "Delete for good",
    "reauth": "Sign in again to delete — it confirms the account is yours."
  },
```

- [ ] **Step 5: Sections**

Каждая секция — отдельный клиентский компонент на `useQuery`/`useMutation` и `authClient`. Общий счётчик способов входа для правила «последний способ» считается в `security-view.tsx` и передаётся секциям пропом `canRemove: boolean` (= `methodCount > 1`); сервер всё равно проверяет (Task 7).

`apps/web/src/features/profile/security-view.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { useAuthSheet } from '@/features/auth/auth-sheet';
import { isPlaceholderEmail } from '@/features/auth/placeholder-email';
import { useSession } from '@/features/auth/use-session';
import { authClient } from '@/lib/auth-client';
import { DeleteAccountSection } from './delete-account-section';
import { EmailSection } from './email-section';
import { PasskeysSection } from './passkeys-section';
import { ProvidersSection } from './providers-section';
import { SessionsSection } from './sessions-section';

export function SecurityView() {
  const t = useTranslations('security');
  const session = useSession();
  const openAuth = useAuthSheet();
  const user = session.data?.user;

  const accounts = useQuery({
    queryKey: ['auth', 'accounts'],
    queryFn: async () => (await authClient.listAccounts()).data ?? [],
    enabled: Boolean(user),
  });
  const passkeys = useQuery({
    queryKey: ['auth', 'passkeys'],
    queryFn: async () => (await authClient.passkey.listUserPasskeys()).data ?? [],
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!session.isPending && !user) {
      openAuth();
    }
  }, [openAuth, session.isPending, user]);

  if (!user) {
    return null;
  }
  const providers = (accounts.data ?? []).filter((a) => a.providerId !== 'credential');
  const hasEmail = user.emailVerified && !isPlaceholderEmail(user.email);
  const methodCount = providers.length + (passkeys.data?.length ?? 0) + (hasEmail ? 1 : 0);
  const canRemove = methodCount > 1;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 py-6">
      <h1 className="font-display font-semibold text-xl">{t('title')}</h1>
      <EmailSection email={hasEmail ? user.email : null} />
      <ProvidersSection linked={providers.map((a) => a.providerId)} canRemove={canRemove} />
      <PasskeysSection passkeys={passkeys.data ?? []} canRemove={canRemove} />
      <SessionsSection />
      <DeleteAccountSection />
    </div>
  );
}
```

Общая обёртка секции — `apps/web/src/features/profile/section.tsx` (отдельный файл, чтобы секции и `security-view.tsx` не импортировали друг друга по кругу):

```tsx
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-medium text-muted-foreground text-sm">{title}</h2>
      {children}
    </section>
  );
}
```

`apps/web/src/features/profile/sessions-section.tsx`:

```tsx
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSession } from '@/features/auth/use-session';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';
import { describeUserAgent } from './user-agent';

export function SessionsSection() {
  const t = useTranslations('security');
  const format = useFormatter();
  const session = useSession();
  const queryClient = useQueryClient();
  const sessions = useQuery({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => (await authClient.listSessions()).data ?? [],
  });
  const current = session.data?.session.token;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });

  return (
    <Section title={t('sessions')}>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {(sessions.data ?? []).map((item) => {
          const device = describeUserAgent(item.userAgent);
          const label = [device.browser, device.os].filter(Boolean).join(' · ') || t('unknownDevice');
          return (
            <li key={item.id} className="flex items-center gap-3 p-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">{label}</span>
                <span className="text-muted-foreground text-xs">
                  {[item.ipAddress, t('lastActive', { date: format.relativeTime(item.updatedAt) })]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </div>
              {item.token === current ? (
                <Badge variant="secondary">{t('thisDevice')}</Badge>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await authClient.revokeSession({ token: item.token });
                    await refresh();
                  }}
                >
                  {t('revoke')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {(sessions.data?.length ?? 0) > 1 && (
        <Button
          variant="outline"
          className="self-start"
          onClick={async () => {
            await authClient.revokeOtherSessions();
            await refresh();
          }}
        >
          {t('revokeOthers')}
        </Button>
      )}
    </Section>
  );
}
```

`apps/web/src/features/profile/passkeys-section.tsx`:

```tsx
'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { authErrorKey } from '@/features/auth/auth-errors';
import { addPasskey, passkeySupported } from '@/features/auth/passkeys';
import { useAuthMethods } from '@/features/auth/use-auth-methods';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';
import { describeUserAgent } from './user-agent';

type Passkey = { id: string; name?: string | null; createdAt: Date | string };

export function PasskeysSection({ passkeys, canRemove }: { passkeys: Passkey[]; canRemove: boolean }) {
  const t = useTranslations('security');
  const tAuth = useTranslations('auth');
  const format = useFormatter();
  const toast = useToast();
  const methods = useAuthMethods();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['auth', 'passkeys'] });
  const report = (error: { code?: string } | null | undefined) =>
    error && toast(tAuth(`errors.${authErrorKey(error)}`));

  return (
    <Section title={t('passkeys')}>
      {passkeys.length === 0 && <p className="text-muted-foreground text-sm">{t('noPasskeys')}</p>}
      <ul className="flex flex-col gap-2">
        {passkeys.map((item) => (
          <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
            <KeyRound className="size-4 shrink-0" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate">{item.name || 'Passkey'}</span>
              <span className="text-muted-foreground text-xs">
                {format.dateTime(new Date(item.createdAt), { dateStyle: 'medium' })}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canRemove}
              title={canRemove ? undefined : t('lastMethodHint')}
              onClick={async () => {
                const result = await authClient.passkey.deletePasskey({ id: item.id });
                report(result.error);
                await refresh();
              }}
            >
              {t('delete')}
            </Button>
          </li>
        ))}
      </ul>
      {passkeySupported(methods.data) && (
        <Button
          variant="outline"
          className="self-start"
          onClick={async () => {
            const result = await addPasskey(describeUserAgent(navigator.userAgent).os ?? undefined);
            report(result?.error);
            await refresh();
          }}
        >
          {t('addPasskey')}
        </Button>
      )}
    </Section>
  );
}
```

`apps/web/src/features/profile/providers-section.tsx`:

```tsx
'use client';

import type { ProviderId } from '@chordtune/api';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { authErrorKey } from '@/features/auth/auth-errors';
import { startNativeSignIn } from '@/features/auth/native-sign-in';
import { linkTelegram } from '@/features/auth/telegram-login';
import { useAuthMethods } from '@/features/auth/use-auth-methods';
import { isCapacitor } from '@/features/song/links';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';

async function link(provider: ProviderId, telegramBot: string | undefined) {
  if (isCapacitor) {
    // The result comes back by deep link; NativeAuthLinks refreshes the queries.
    return startNativeSignIn({ provider, mode: 'link' });
  }
  const callbackURL = window.location.href;
  if (provider === 'telegram') {
    return telegramBot ? linkTelegram(telegramBot) : undefined;
  }
  return authClient.linkSocial({ provider, callbackURL });
}

export function ProvidersSection({ linked, canRemove }: { linked: string[]; canRemove: boolean }) {
  const t = useTranslations('security');
  const tAuth = useTranslations('auth');
  const toast = useToast();
  const methods = useAuthMethods();
  const queryClient = useQueryClient();
  const providers = methods.data?.providers ?? [];
  if (providers.length === 0) {
    return null;
  }
  const report = (result: unknown) => {
    const error = (result as { error?: { code?: string } | null } | undefined)?.error;
    if (error) {
      toast(tAuth(`errors.${authErrorKey(error)}`));
    }
  };

  return (
    <Section title={t('services')}>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
        {providers.map((provider) => {
          const isLinked = linked.includes(provider);
          return (
            <li key={provider} className="flex items-center justify-between p-3">
              <span>{tAuth(`providers.${provider}`)}</span>
              {isLinked ? (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!canRemove}
                  title={canRemove ? undefined : t('lastMethodHint')}
                  onClick={async () => {
                    report(await authClient.unlinkAccount({ providerId: provider }));
                    await queryClient.invalidateQueries({ queryKey: ['auth', 'accounts'] });
                  }}
                >
                  {t('unlink')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    report(await link(provider, methods.data?.telegramBot?.id));
                    await queryClient.invalidateQueries({ queryKey: ['auth', 'accounts'] });
                  }}
                >
                  {t('link')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
```

`apps/web/src/features/profile/email-section.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authErrorKey } from '@/features/auth/auth-errors';
import { normalizeOtp, OTP_LENGTH } from '@/features/auth/otp';
import { useSession } from '@/features/auth/use-session';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';

export function EmailSection({ email }: { email: string | null }) {
  const t = useTranslations('security');
  const tAuth = useTranslations('auth');
  const session = useSession();
  const [newEmail, setNewEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (email) {
    return (
      <Section title={t('email')}>
        <span>{email}</span>
      </Section>
    );
  }

  const message = (failure: { code?: string; status?: number }) =>
    failure.code === 'USER_ALREADY_EXISTS' || failure.code === 'EMAIL_ALREADY_EXISTS'
      ? t('emailTaken')
      : tAuth(`errors.${authErrorKey(failure)}`);

  return (
    <Section title={t('addEmail')}>
      {!sent ? (
        <form
          className="flex gap-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            const result = await authClient.emailOtp.requestEmailChange({ newEmail: newEmail.trim() });
            if (result.error) {
              setError(message(result.error));
              return;
            }
            setSent(true);
          }}
        >
          <Input type="email" required autoComplete="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <Button type="submit">{t('sendCode')}</Button>
        </form>
      ) : (
        <Input
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          placeholder={tAuth('code')}
          value={code}
          onChange={async (event) => {
            const next = normalizeOtp(event.target.value);
            setCode(next);
            if (next.length !== OTP_LENGTH) {
              return;
            }
            const result = await authClient.emailOtp.changeEmail({ newEmail: newEmail.trim(), otp: next });
            if (result.error) {
              setError(message(result.error));
              return;
            }
            await session.refetch();
          }}
        />
      )}
      {error && <p className="text-destructive text-sm">{error}</p>}
    </Section>
  );
}
```

Сверь код ошибки «почта занята» с `node_modules/better-auth/dist/plugins/email-otp/error-codes.mjs` и оставь в `message` только настоящий.

`apps/web/src/features/profile/delete-account-section.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuthSheet } from '@/features/auth/auth-sheet';
import { authErrorKey } from '@/features/auth/auth-errors';
import { useSession } from '@/features/auth/use-session';
import { useRouter } from '@/i18n/navigation';
import { authToken } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { Section } from './section';

export function DeleteAccountSection() {
  const t = useTranslations('security');
  const tAuth = useTranslations('auth');
  const session = useSession();
  const router = useRouter();
  const openAuth = useAuthSheet();
  const [open, setOpen] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setError(null);
    const result = await authClient.deleteUser();
    if (result.error) {
      if (authErrorKey(result.error) === 'reauth') {
        setNeedsReauth(true);
      } else {
        setError(tAuth(`errors.${authErrorKey(result.error)}`));
      }
      return;
    }
    authToken.set(null);
    await session.refetch();
    router.push('/');
  };

  return (
    <Section title={t('deleteAccount')}>
      <Button variant="destructive" className="self-start" onClick={() => setOpen(true)}>
        {t('deleteAccount')}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-w-md rounded-t-xl sm:mb-8 sm:rounded-xl">
          <div className="flex flex-col gap-4 p-4 pt-0">
            <SheetHeader className="px-0">
              <SheetTitle>{t('deleteAccount')}</SheetTitle>
              <SheetDescription>{needsReauth ? t('reauth') : t('deleteWarning')}</SheetDescription>
            </SheetHeader>
            {error && <p className="text-destructive text-sm">{error}</p>}
            {needsReauth ? (
              <Button
                size="lg"
                onClick={() => {
                  setNeedsReauth(false);
                  setOpen(false);
                  openAuth();
                }}
              >
                {tAuth('signIn')}
              </Button>
            ) : (
              <Button variant="destructive" size="lg" onClick={remove}>
                {t('deleteConfirm')}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </Section>
  );
}
```

Если у `Button` нет варианта `destructive`, посмотри варианты в `components/ui/button.tsx` и возьми ближайший (или добавь `destructive` по образцу shadcn).

Повторный вход из этой шторки создаёт новую свежую сессию; пользователь возвращается на «Безопасность» и жмёт удаление ещё раз.

`apps/web/src/app/[locale]/profile/security/page.tsx`:

```tsx
import { SecurityView } from '@/features/profile/security-view';
import { resolveLocale } from '@/i18n/params';

export default async function SecurityPage({ params }: PageProps<'/[locale]/profile/security'>) {
  await resolveLocale(params);
  return <SecurityView />;
}
```

- [ ] **Step 6: Run checks**

Run: `bun run test && bun run check-types && bun run lint && cd apps/web && bun run build:cap`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web
git commit -m "Manage sessions, passkeys, linked services and account deletion"
```

---

### Task 17: Предложение добавить passkey

**Files:**
- Create: `apps/web/src/features/auth/passkey-offer.tsx`, `apps/web/src/features/auth/passkey-offer-state.ts`
- Modify: `apps/web/src/components/providers.tsx`
- Modify: `apps/web/messages/*.json` (`auth.passkeyOffer`)
- Test: `apps/web/src/features/auth/passkey-offer-state.test.ts`

**Interfaces:**
- Consumes: `passkeySupported`, `addPasskey` (Task 13), `useAuthMethods`, `useSession`, `authClient.passkey.listUserPasskeys`.
- Produces: `shouldOfferPasskey(params: { signedIn: boolean; supported: boolean; passkeyCount: number | undefined; dismissed: boolean }): boolean`, `passkeyOfferStore: { dismissed(): boolean; dismiss(): void }`

- [ ] **Step 1: Write the failing test**

`apps/web/src/features/auth/passkey-offer-state.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';

import { shouldOfferPasskey } from './passkey-offer-state';

describe('shouldOfferPasskey', () => {
  const base = { signedIn: true, supported: true, passkeyCount: 0, dismissed: false };

  test('signed in, supported, no passkeys, not dismissed', () => {
    expect(shouldOfferPasskey(base)).toBe(true);
  });

  test('any reason not to', () => {
    expect(shouldOfferPasskey({ ...base, signedIn: false })).toBe(false);
    expect(shouldOfferPasskey({ ...base, supported: false })).toBe(false);
    expect(shouldOfferPasskey({ ...base, passkeyCount: 1 })).toBe(false);
    expect(shouldOfferPasskey({ ...base, passkeyCount: undefined })).toBe(false);
    expect(shouldOfferPasskey({ ...base, dismissed: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && bun test src/features/auth/passkey-offer-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

`apps/web/src/features/auth/passkey-offer-state.ts`:

```ts
const KEY = 'chordtune.passkey-offer-dismissed';

export function shouldOfferPasskey(params: {
  signedIn: boolean;
  supported: boolean;
  passkeyCount: number | undefined;
  dismissed: boolean;
}) {
  return (
    params.signedIn && params.supported && params.passkeyCount === 0 && !params.dismissed
  );
}

export const passkeyOfferStore = {
  dismissed() {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return true;
    }
  },
  dismiss() {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // storage can be unavailable
    }
  },
};
```

Messages, в `auth`: ru — `"passkeyOffer": { "title": "Входить по Face ID или отпечатку?", "text": "Добавьте passkey — в следующий раз не понадобится код из письма.", "add": "Добавить", "later": "Не сейчас" }`; en — `"passkeyOffer": { "title": "Sign in with Face ID or a fingerprint?", "text": "Add a passkey and skip the email code next time.", "add": "Add", "later": "Not now" }`.

`apps/web/src/features/auth/passkey-offer.tsx`:

```tsx
'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { authClient } from '@/lib/auth-client';
import { addPasskey, passkeySupported } from './passkeys';
import { passkeyOfferStore, shouldOfferPasskey } from './passkey-offer-state';
import { useAuthMethods } from './use-auth-methods';
import { useSession } from './use-session';

/** A one-time nudge after sign-in; closing it means never again on this device. */
export function PasskeyOffer() {
  const t = useTranslations('auth.passkeyOffer');
  const session = useSession();
  const methods = useAuthMethods();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState(() => passkeyOfferStore.dismissed());
  const signedIn = Boolean(session.data?.user);
  const passkeys = useQuery({
    queryKey: ['auth', 'passkeys'],
    queryFn: async () => (await authClient.passkey.listUserPasskeys()).data ?? [],
    enabled: signedIn && !dismissed,
  });

  if (
    !shouldOfferPasskey({
      signedIn,
      supported: passkeySupported(methods.data),
      passkeyCount: passkeys.data?.length,
      dismissed,
    })
  ) {
    return null;
  }
  const close = () => {
    passkeyOfferStore.dismiss();
    setDismissed(true);
  };

  return (
    <div className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-start gap-3 rounded-xl border border-border bg-popover p-4 shadow-lg md:bottom-6">
      <KeyRound className="mt-0.5 size-5 shrink-0" />
      <div className="flex flex-1 flex-col gap-2">
        <p className="font-medium">{t('title')}</p>
        <p className="text-muted-foreground text-sm">{t('text')}</p>
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={async () => {
              const result = await addPasskey();
              if (result && !result.error) {
                await queryClient.invalidateQueries({ queryKey: ['auth', 'passkeys'] });
                close();
              }
            }}
          >
            {t('add')}
          </Button>
          <Button size="sm" variant="ghost" onClick={close}>
            {t('later')}
          </Button>
        </div>
      </div>
      <Button size="icon-sm" variant="ghost" aria-label={t('later')} onClick={close}>
        <X />
      </Button>
    </div>
  );
}
```

В `providers.tsx` рядом с `<OfflineSync />`: `<PasskeyOffer />`.

- [ ] **Step 4: Run checks**

Run: `bun run test && bun run check-types && bun run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web
git commit -m "Offer a passkey once after sign-in"
```

---

### Task 18: Деплой, README, релиз

**Files:**
- Modify: `.env.example`, `deploy/.env.example`, `deploy/compose.yml` (проброс переменных в `app`)
- Modify: `.github/workflows/release.yml` (`ANDROID_CERT_SHA256`, домен в `asset_statements`)
- Modify: `README.md` (раздел «Авторизация»)
- Modify: `docs/plans/2026-09-26-chordtune-design.md` (заметка о входе в «Решения/Статус»)

**Interfaces:**
- Consumes: все переменные из Task 1.

- [ ] **Step 1: Env examples**

В `.env.example` после блока `apps/api`:

```sh
# Sign-in. Every provider is optional: without its keys the button is hidden.
# Email codes: any SMTP provider (Unisender Go, Resend, Brevo, SES…). Without SMTP_URL codes go to the API log.
SMTP_URL=
MAIL_FROM="ChordTune <no-reply@localhost>"
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
VK_CLIENT_ID=
VK_CLIENT_SECRET=
# From @BotFather; the bot's domain must be set with /setdomain.
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_NAME=
# A store-review account: this email always accepts this code and gets no mail.
REVIEW_EMAIL=
REVIEW_CODE=
# Passkeys in the apps: Apple team id (paid account) and the APK signing key SHA-256.
APPLE_TEAM_ID=
ANDROID_CERT_SHA256=
```

То же — в `deploy/.env.example` (с комментарием, что `SMTP_URL` в проде нужен для входа по коду), и в `deploy/compose.yml` у сервиса `app` в `environment` перечисли эти переменные как `NAME: ${NAME:-}` (посмотри, как там передаются существующие).

- [ ] **Step 2: Release workflow**

В `.github/workflows/release.yml`, в шаге сборки APK, до `cap sync`/gradle:

```yaml
      - name: Point Android passkeys at the public domain
        run: |
          host=$(echo "${{ vars.PUBLIC_URL }}" | sed -E 's#^https?://##; s#/.*$##')
          sed -i "s#chordtune.example.com#${host}#" apps/web/android/app/src/main/res/values/strings.xml
```

и выведи отпечаток ключа для настройки сервера (секреты keystore уже есть — посмотри их имена в workflow):

```yaml
      - name: Print the signing key SHA-256 for ANDROID_CERT_SHA256
        run: keytool -list -v -keystore release.keystore -storepass "$KEYSTORE_PASSWORD" | grep 'SHA256:'
```

(подставь реальные путь и переменную keystore из существующих шагов).

- [ ] **Step 3: README**

Добавить после «Setup» раздел:

```markdown
## Sign-in

No passwords: Yandex, VK, Google, Telegram, passkeys and a code by email. Each provider turns on when
its keys are in the environment (see `.env.example`).

| Provider | Where | Callback / setting |
|---|---|---|
| Yandex | oauth.yandex.ru → new app, web services, access to email and avatar | `https://<domain>/api/auth/callback/yandex` |
| VK | id.vk.com → app type «Web» | trusted redirect URL `https://<domain>/api/auth/callback/vk` |
| Google | Google Cloud Console → OAuth consent screen → Credentials → Web client | `https://<domain>/api/auth/callback/google` |
| Telegram | @BotFather → `/newbot`, then `/setdomain` | your domain |

Email codes need an SMTP provider (`SMTP_URL`, `MAIL_FROM`) and SPF, DKIM and DMARC records for the
sender's domain, or Mail.ru and Gmail will treat the codes as spam.

The mobile apps sign in through the system browser and come back by the `app.chordtune://auth` deep
link. Passkeys in the apps also need `APPLE_TEAM_ID` (iOS, paid Apple Developer account and the
Associated Domains capability) and `ANDROID_CERT_SHA256` (the release key; the release workflow
prints it); the server then serves `/.well-known/apple-app-site-association` and `assetlinks.json`.
```

- [ ] **Step 4: Design doc note**

В `docs/plans/2026-09-26-chordtune-design.md`, раздел «Решения»: строку про bearer-плагин дополнить: «Вход без пароля — `2026-10-06-auth-and-profile-design.md`».

- [ ] **Step 5: Full verification**

Run: `bun run lint && bun run check-types && bun run test && cd apps/web && bun run build && bun run build:cap`
Expected: всё зелёное.

- [ ] **Step 6: Commit**

```bash
git add .env.example deploy .github README.md docs/plans/2026-09-26-chordtune-design.md
git commit -m "Document sign-in setup and wire it into deploy and release"
```
