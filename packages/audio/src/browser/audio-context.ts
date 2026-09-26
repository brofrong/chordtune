let context: AudioContext | null = null;

/** One AudioContext for all playback, resumed after a user gesture; null outside the browser. */
export async function getAudioContext(): Promise<AudioContext | null> {
  if (typeof window === 'undefined') {
    return null;
  }
  context ??= new AudioContext();
  if (context.state === 'suspended') {
    await context.resume();
  }
  return context;
}
