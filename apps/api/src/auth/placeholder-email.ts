/** `.invalid` is reserved (RFC 2606), so these addresses can never belong to a real mailbox. */
const DOMAIN = 'users.invalid';

/** Stands in for the email Better Auth requires when the provider gives none (Telegram, some VK). */
export function placeholderEmail(kind: 'tg' | 'vk', id: string) {
  return `${kind}-${id}@${DOMAIN}`;
}

export function isPlaceholderEmail(email: string) {
  return email.endsWith(`@${DOMAIN}`);
}
