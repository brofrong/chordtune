import { yandex } from 'better-auth/plugins';

import type { AuthConfig } from './config';
import { placeholderEmail } from './placeholder-email';

/** Providers whose email is verified, so signing in with them may join an account of that email. */
export const TRUSTED_PROVIDERS = ['google', 'yandex'] as const;

/**
 * VK never vouches for the email it returns, and Better Auth refuses to link an untrusted provider
 * with an unverified email — so VK always gets its own placeholder, which is "verified" because it
 * can only ever match the same VK account (no merging by email). A VK user adds a real address
 * from the profile.
 */
export function vkProfileToUser(profile: { user: { user_id: string | number; email?: string } }) {
  return { email: placeholderEmail('vk', String(profile.user.user_id)), emailVerified: true };
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
