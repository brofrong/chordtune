export async function signInWithPasskey(): Promise<{ error?: { code?: string } | null } | void> {
  return { error: { code: 'NOT_READY' } };
}
