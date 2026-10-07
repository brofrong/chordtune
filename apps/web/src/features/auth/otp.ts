export const OTP_LENGTH = 6;

/** Codes get pasted as «123 456» or «Код: 123456»; only the digits matter. */
export function normalizeOtp(value: string) {
  return value.replace(/\D/g, '').slice(0, OTP_LENGTH);
}
