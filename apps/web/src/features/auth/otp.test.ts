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
