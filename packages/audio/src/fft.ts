export function applyHannWindow(samples: ArrayLike<number>, out: Float32Array): void {
  const n = out.length;
  for (let i = 0; i < n; i++) {
    const window = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
    out[i] = (samples[i] ?? 0) * window;
  }
}

export function fftMagnitudes(realInput: Float32Array): Float32Array {
  const n = realInput.length;
  const real = new Float32Array(realInput);
  const imag = new Float32Array(n);

  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = real[i];
      real[i] = real[j];
      real[j] = tr;
      const ti = imag[i];
      imag[i] = imag[j];
      imag[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angle = (-2 * Math.PI) / size;
    const wReal = Math.cos(angle);
    const wImag = Math.sin(angle);
    for (let start = 0; start < n; start += size) {
      let wr = 1;
      let wi = 0;
      for (let k = 0; k < half; k++) {
        const even = start + k;
        const odd = even + half;
        const tr = wr * real[odd] - wi * imag[odd];
        const ti = wr * imag[odd] + wi * real[odd];
        real[odd] = real[even] - tr;
        imag[odd] = imag[even] - ti;
        real[even] += tr;
        imag[even] += ti;
        const nextWr = wr * wReal - wi * wImag;
        wi = wr * wImag + wi * wReal;
        wr = nextWr;
      }
    }
  }

  const bins = n / 2;
  const magnitudes = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    magnitudes[i] = Math.hypot(real[i], imag[i]) / n;
  }
  return magnitudes;
}

export function downsampleSigned(values: ArrayLike<number>, buckets: number): number[] {
  const out: number[] = new Array(buckets).fill(0);
  if (values.length === 0 || buckets === 0) {
    return out;
  }

  const step = values.length / buckets;
  for (let i = 0; i < buckets; i++) {
    out[i] = values[Math.min(values.length - 1, Math.floor(i * step))];
  }
  return out;
}

export function spectrumToDbBars(
  magnitudes: ArrayLike<number>,
  sampleRate: number,
  maxHz: number,
  bars: number,
): number[] {
  const binHz = sampleRate / (magnitudes.length * 2);
  const maxBin = Math.max(1, Math.min(magnitudes.length, Math.floor(maxHz / binHz)));
  const out: number[] = new Array(bars).fill(0);
  const bucketSize = maxBin / bars;

  for (let i = 0; i < bars; i++) {
    const start = Math.floor(i * bucketSize);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucketSize));
    let peak = 0;
    for (let j = start; j < end && j < maxBin; j++) {
      if (magnitudes[j] > peak) {
        peak = magnitudes[j];
      }
    }
    const db = peak > 1e-12 ? 20 * Math.log10(peak) : -80;
    out[i] = Math.max(0, Math.min(1, (db + 80) / 80));
  }

  return out;
}
