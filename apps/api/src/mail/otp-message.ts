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
