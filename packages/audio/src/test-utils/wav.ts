import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const NOTES_DIR = join(import.meta.dir, '../../fixtures/notes');

export function listNoteFixtures(): string[] {
  return readdirSync(NOTES_DIR)
    .filter((name) => name.endsWith('.wav'))
    .sort();
}

/** `E2_20260825-131549.wav` → `E2` */
export function noteFromFilename(filename: string): string {
  return filename.split('_')[0] ?? filename;
}

export async function readNoteFixture(
  filename: string,
): Promise<{ sampleRate: number; samples: Float32Array }> {
  return decodeWavPcm16Mono(await Bun.file(join(NOTES_DIR, filename)).bytes());
}

export function decodeWavPcm16Mono(bytes: Uint8Array): {
  sampleRate: number;
  samples: Float32Array;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 44100;
  let dataOffset = 44;
  let dataSize = 0;

  while (offset + 8 <= bytes.length) {
    const id = String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      sampleRate = view.getUint32(offset + 12, true);
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataSize = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  const count = Math.floor(dataSize / 2);
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    samples[i] = view.getInt16(dataOffset + i * 2, true) / 32768;
  }
  return { sampleRate, samples };
}

export function sineWave(
  frequency: number,
  sampleRate: number,
  length: number,
  amplitude = 1,
): Float32Array {
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return samples;
}
