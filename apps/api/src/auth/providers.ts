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
