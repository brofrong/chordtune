import { synthesizeNote } from '../guitar-synth';
import { getAudioContext } from './audio-context';

let current: AudioBufferSourceNode | null = null;
const cache = new Map<string, AudioBuffer>();

/** Plays a plucked reference note; a new call cuts the previous one off. */
export async function playReferenceTone(frequency: number): Promise<void> {
  const context = await getAudioContext();
  if (!context) {
    return;
  }

  const key = `${context.sampleRate}:${frequency.toFixed(3)}`;
  let buffer = cache.get(key);
  if (!buffer) {
    const samples = synthesizeNote(frequency, { sampleRate: context.sampleRate });
    buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.copyToChannel(samples, 0);
    cache.set(key, buffer);
  }

  current?.stop();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    if (current === source) {
      current = null;
    }
  };
  source.start();
  current = source;
}

export function stopReferenceTone() {
  current?.stop();
  current = null;
}
