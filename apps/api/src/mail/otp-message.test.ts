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
