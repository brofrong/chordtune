import type { ProviderId } from '@chordtune/api';

export async function startNativeSignIn(_params: { provider: ProviderId }): Promise<void> {
  throw new Error('Native sign-in is not wired yet');
}
