/** Same domain as the API's placeholder addresses: accounts without a real email. */
export function isPlaceholderEmail(email: string | null | undefined) {
  return !email || email.endsWith('@users.invalid');
}
