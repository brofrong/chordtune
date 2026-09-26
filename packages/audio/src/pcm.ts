export const ANALYSIS_TARGET_PEAK = 0.7;
export const ANALYSIS_NOISE_PEAK = 0.00025;
export const ANALYSIS_MAX_GAIN = 250;

export function peakAmplitude(samples: ArrayLike<number>): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const amplitude = Math.abs(samples[i]);
    if (amplitude > peak) {
      peak = amplitude;
    }
  }
  return peak;
}

export function analysisGain(peak: number, userGain = 1): number {
  if (!(peak > ANALYSIS_NOISE_PEAK)) {
    return 1;
  }
  return Math.min(ANALYSIS_MAX_GAIN, (ANALYSIS_TARGET_PEAK / peak) * userGain);
}

export function applyGain(
  samples: ArrayLike<number>,
  gain: number,
  out: Float32Array = new Float32Array(samples.length),
): Float32Array {
  const n = Math.min(samples.length, out.length);
  for (let i = 0; i < n; i++) {
    const value = samples[i] * gain;
    out[i] = value > 1 ? 1 : value < -1 ? -1 : value;
  }
  return out;
}

export function toMono(samples: Float32Array, channels: number): Float32Array {
  if (channels <= 1) {
    return samples;
  }

  const frames = Math.floor(samples.length / channels);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    mono[i] = samples[i * channels];
  }
  return mono;
}

export class SampleRing {
  readonly data: Float32Array;
  private write = 0;
  filled = false;

  constructor(size: number) {
    this.data = new Float32Array(size);
  }

  get size() {
    return this.data.length;
  }

  push(chunk: ArrayLike<number>) {
    for (let i = 0; i < chunk.length; i++) {
      this.data[this.write] = chunk[i];
      this.write += 1;
      if (this.write >= this.data.length) {
        this.write = 0;
        this.filled = true;
      }
    }
  }

  snapshot(out: Float32Array): number {
    const n = this.data.length;
    if (this.filled) {
      const head = n - this.write;
      out.set(this.data.subarray(this.write), 0);
      out.set(this.data.subarray(0, this.write), head);
      return n;
    }

    out.set(this.data.subarray(0, this.write));
    if (this.write < n) {
      out.fill(0, this.write);
    }
    return this.write;
  }
}
