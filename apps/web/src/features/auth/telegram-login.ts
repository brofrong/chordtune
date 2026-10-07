export async function openTelegramLogin(
  _botId: string,
): Promise<{ error?: { code?: string } | null } | void> {
  return { error: { code: 'NOT_READY' } };
}
