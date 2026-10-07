export async function openTelegramLogin(
  _botId: string,
): Promise<{ error?: { code?: string } | null } | undefined> {
  return { error: { code: 'NOT_READY' } };
}
