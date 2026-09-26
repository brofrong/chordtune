import { midiToHz } from './pitch';

export const SAMPLE_RATE = 44100;
export const DEFAULT_DURATION_SEC = 1.6;

/** Standard tuning, low E → high E. */
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64] as const;

export type GuitarFrets = readonly (number | null)[];

export type ChordVariant = 'clean' | 'noise';

export type ChordSpec = {
  label: string;
  frets: GuitarFrets;
};

export type SynthOptions = {
  sampleRate?: number;
  durationSec?: number;
  seed?: number;
  variant?: ChordVariant;
  strumMs?: number;
  detuneCents?: number;
  noiseAmount?: number;
};

/**
 * Standard guitar shapes, low E → high E. `null` is a muted string.
 * Labels match `formatChordLabel` in chords.ts.
 */
export const CHORD_CATALOG: ChordSpec[] = [
  { label: 'C', frets: [null, 3, 2, 0, 1, 0] },
  { label: 'C#', frets: [null, 4, 6, 6, 6, 4] },
  { label: 'D', frets: [null, null, 0, 2, 3, 2] },
  { label: 'D#', frets: [null, null, 1, 3, 4, 3] },
  { label: 'E', frets: [0, 2, 2, 1, 0, 0] },
  { label: 'F', frets: [1, 3, 3, 2, 1, 1] },
  { label: 'F#', frets: [2, 4, 4, 3, 2, 2] },
  { label: 'G', frets: [3, 2, 0, 0, 0, 3] },
  { label: 'G#', frets: [4, 6, 6, 5, 4, 4] },
  { label: 'A', frets: [null, 0, 2, 2, 2, 0] },
  { label: 'A#', frets: [null, 1, 3, 3, 3, 1] },
  { label: 'B', frets: [null, 2, 4, 4, 4, 2] },

  { label: 'Cm', frets: [null, 3, 5, 5, 4, 3] },
  { label: 'C#m', frets: [null, 4, 6, 6, 5, 4] },
  { label: 'Dm', frets: [null, null, 0, 2, 3, 1] },
  { label: 'D#m', frets: [null, null, 1, 3, 4, 2] },
  { label: 'Em', frets: [0, 2, 2, 0, 0, 0] },
  { label: 'Fm', frets: [1, 3, 3, 1, 1, 1] },
  { label: 'F#m', frets: [2, 4, 4, 2, 2, 2] },
  { label: 'Gm', frets: [3, 5, 5, 3, 3, 3] },
  { label: 'G#m', frets: [4, 6, 6, 4, 4, 4] },
  { label: 'Am', frets: [null, 0, 2, 2, 1, 0] },
  { label: 'A#m', frets: [null, 1, 3, 3, 2, 1] },
  { label: 'Bm', frets: [null, 2, 4, 4, 3, 2] },

  { label: 'A7', frets: [null, 0, 2, 0, 2, 0] },
  { label: 'B7', frets: [null, 2, 1, 2, 0, 2] },
  { label: 'C7', frets: [null, 3, 2, 3, 1, 0] },
  { label: 'D7', frets: [null, null, 0, 2, 1, 2] },
  { label: 'E7', frets: [0, 2, 0, 1, 0, 0] },
  { label: 'G7', frets: [3, 2, 0, 0, 0, 1] },

  { label: 'Cmaj7', frets: [null, 3, 2, 0, 0, 0] },
  { label: 'Am7', frets: [null, 0, 2, 0, 1, 0] },
  { label: 'Bdim', frets: [null, 2, 3, 4, 3, null] },
  { label: 'Caug', frets: [null, 3, 2, 1, 1, 0] },
  { label: 'Dsus2', frets: [null, null, 0, 2, 3, 0] },
  { label: 'Asus4', frets: [null, 0, 2, 2, 3, 0] },
  { label: 'E6', frets: [0, 2, 2, 1, 2, 0] },
  { label: 'Am6', frets: [null, 0, 2, 2, 1, 2] },
];

export function voicingToMidi(frets: GuitarFrets): number[] {
  const notes: number[] = [];
  for (let i = 0; i < frets.length; i++) {
    const fret = frets[i];
    if (fret === null || fret === undefined) {
      continue;
    }
    notes.push(OPEN_STRING_MIDI[i] + fret);
  }
  return notes;
}

export function chordFolderName(label: string): string {
  return label;
}

export function chordFilename(label: string, variant: ChordVariant, index: number): string {
  const safe = label.replaceAll('#', 's');
  return `${safe}_${variant}_${index}.wav`;
}

export function synthesizeChord(
  spec: ChordSpec,
  options: SynthOptions = {},
): {
  samples: Float32Array;
  sampleRate: number;
} {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const durationSec = options.durationSec ?? DEFAULT_DURATION_SEC;
  const seed = options.seed ?? 1;
  const variant = options.variant ?? 'clean';
  const strumMs = options.strumMs ?? 4.2;
  const detuneCents = options.detuneCents ?? 0;
  const noiseAmount = options.noiseAmount ?? (variant === 'noise' ? 0.09 : 0);

  const length = Math.floor(sampleRate * durationSec);
  const mix = new Float32Array(length);
  const midiNotes = voicingToMidi(spec.frets);
  const strumDelay = Math.max(0, Math.floor((strumMs / 1000) * sampleRate));
  const rng = mulberry32(hashSeed(seed, spec.label, variant));

  midiNotes.forEach((midi, stringIndex) => {
    const cents = detuneCents + (rng() - 0.5) * 2.4;
    const frequency = midiToHz(midi) * 2 ** (cents / 1200);
    const start = stringIndex * strumDelay;
    const remaining = Math.max(1, length - start);
    const plucked = pluckedString(frequency, remaining, sampleRate, rng);
    const gain = stringGain(stringIndex, midiNotes.length);
    for (let i = 0; i < plucked.length; i++) {
      mix[start + i] += plucked[i] * gain;
    }
  });

  if (noiseAmount > 0) {
    addPinkNoise(mix, noiseAmount, rng);
  }

  applyEnvelope(mix, sampleRate);
  normalizePeak(mix, 0.74);
  return { samples: mix, sampleRate };
}

export type NoteSynthOptions = {
  sampleRate?: number;
  durationSec?: number;
  gain?: number;
};

/**
 * Reference tone for the tuner. Additive rather than Karplus–Strong so the pitch is exact:
 * a delay-line pluck is off by several cents on the high strings unless it is fractionally tuned.
 */
export function synthesizeNote(
  frequency: number,
  options: NoteSynthOptions = {},
): Float32Array<ArrayBuffer> {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const length = Math.floor(sampleRate * (options.durationSec ?? 2.4));
  const out = new Float32Array(length);
  const twoPi = 2 * Math.PI;
  const nyquist = sampleRate / 2;
  const baseDecay = 0.9 + 60 / frequency;
  const rng = mulberry32(Math.round(frequency * 100));

  for (let h = 1; h <= 10; h++) {
    const partial = frequency * h;
    if (partial >= nyquist * 0.9) {
      break;
    }
    const amp = 1 / h ** 1.4;
    const decay = baseDecay / (1 + (h - 1) * 0.45);
    const phase = rng() * twoPi;
    const step = (twoPi * partial) / sampleRate;
    for (let i = 0; i < length; i++) {
      out[i] += amp * Math.exp(-i / sampleRate / decay) * Math.sin(step * i + phase);
    }
  }

  applyEnvelope(out, sampleRate);
  normalizePeak(out, options.gain ?? 0.6);
  return out;
}

export type PluckOptions = {
  sampleRate?: number;
  durationSec?: number;
  seed?: number;
};

/** One plucked guitar string for the strum player, peak-normalised so a full strum stays below 1. */
export function synthesizePluck(
  frequency: number,
  options: PluckOptions = {},
): Float32Array<ArrayBuffer> {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  const length = Math.floor(sampleRate * (options.durationSec ?? DEFAULT_DURATION_SEC));
  const rng = mulberry32(options.seed ?? Math.round(frequency * 100));
  const samples = pluckedString(frequency, length, sampleRate, rng);
  applyEnvelope(samples, sampleRate);
  normalizePeak(samples, 0.3);
  return samples;
}

/**
 * Plucked string with harmonics 1–4 only.
 * The 5th/7th overtones of a real guitar land on the major 3rd and minor 7th
 * and make the chroma detector prefer maj7/7 over the intended triad.
 */
function pluckedString(
  frequency: number,
  length: number,
  sampleRate: number,
  rng: () => number,
): Float32Array<ArrayBuffer> {
  const out = new Float32Array(length);
  const decaySec = 0.42 + 70 / frequency;
  const pickMs = 6 + rng() * 4;
  const pickSamples = Math.max(1, Math.floor((pickMs / 1000) * sampleRate));
  const twoPi = 2 * Math.PI;
  const harmonics = [
    { ratio: 1, amp: 1 },
    { ratio: 2, amp: 0.32 },
    { ratio: 3, amp: 0.07 },
    { ratio: 4, amp: 0.04 },
  ];
  const phases = harmonics.map(() => rng() * twoPi);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t / decaySec);
    let sample = 0;
    for (let h = 0; h < harmonics.length; h++) {
      const spec = harmonics[h];
      sample += spec.amp * Math.sin(twoPi * frequency * spec.ratio * t + phases[h]);
    }
    if (i < pickSamples) {
      sample += (rng() * 2 - 1) * (1 - i / pickSamples) * 0.35;
    }
    out[i] = sample * env;
  }

  return out;
}

function stringGain(index: number, count: number): number {
  const bass = 1 - index * (0.07 / Math.max(1, count - 1));
  return (0.92 / Math.sqrt(count)) * bass;
}

function applyEnvelope(samples: Float32Array, sampleRate: number) {
  const attack = Math.floor(sampleRate * 0.004);
  const release = Math.floor(sampleRate * 0.09);
  const n = samples.length;
  for (let i = 0; i < attack && i < n; i++) {
    samples[i] *= i / attack;
  }
  for (let i = 0; i < release && i < n; i++) {
    const index = n - 1 - i;
    samples[index] *= i / release;
  }
}

function normalizePeak(samples: Float32Array, peak: number) {
  let max = 0;
  for (let i = 0; i < samples.length; i++) {
    max = Math.max(max, Math.abs(samples[i]));
  }
  if (max < 1e-9) {
    return;
  }
  const gain = peak / max;
  for (let i = 0; i < samples.length; i++) {
    samples[i] *= gain;
  }
}

function addPinkNoise(samples: Float32Array, amount: number, rng: () => number) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < samples.length; i++) {
    const white = rng() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
    samples[i] += pink * amount;
  }
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed: number, label: string, variant: string): number {
  let h = seed >>> 0;
  const text = `${label}:${variant}`;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}
