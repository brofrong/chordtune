export async function signInWithPasskey(): Promise<
  { error?: { code?: string } | null } | undefined
> {
  return { error: { code: 'NOT_READY' } };
}
