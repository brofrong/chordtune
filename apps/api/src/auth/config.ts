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

export function authConfig(
  env: Partial<AuthEnv> & Pick<AuthEnv, 'BETTER_AUTH_URL' | 'WEB_ORIGINS'>,
): AuthConfig {
  const { TELEGRAM_BOT_TOKEN: botToken, TELEGRAM_BOT_NAME: botName } = env;
  const webOrigins = env.WEB_ORIGINS.filter((origin) => /^https?:\/\//.test(origin));
  return {
    google: keys(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
    vk: keys(env.VK_CLIENT_ID, env.VK_CLIENT_SECRET),
    yandex: keys(env.YANDEX_CLIENT_ID, env.YANDEX_CLIENT_SECRET),
    telegram:
      botToken && botName ? { botToken, botName, botId: botToken.split(':')[0] ?? '' } : undefined,
    review:
      env.REVIEW_EMAIL && env.REVIEW_CODE
        ? { email: env.REVIEW_EMAIL.toLowerCase(), code: env.REVIEW_CODE }
        : undefined,
    passkey: {
      rpID: new URL(env.BETTER_AUTH_URL).hostname ?? '',
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
