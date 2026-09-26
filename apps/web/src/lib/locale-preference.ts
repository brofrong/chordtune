import { hasLocale } from 'next-intl';

import { type Locale, routing } from '@/i18n/routing';

const STORAGE_KEY = 'chordtune.locale';

export function preferredLocale(): Locale {
  const saved = readStorage();
  if (hasLocale(routing.locales, saved)) {
    return saved;
  }
  for (const language of navigator.languages ?? [navigator.language]) {
    const base = language.split('-')[0];
    if (hasLocale(routing.locales, base)) {
      return base;
    }
  }
  return routing.defaultLocale;
}

export function rememberLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // storage can be unavailable in private mode
  }
}

function readStorage(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
