export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
] as const;
export type NoteName = (typeof NOTE_NAMES)[number];

export const DEFAULT_A4_HZ = 440;
const A4_MIDI = 69;
const YIN_THRESHOLD = 0.15;
const DEFAULT_MIN_HZ = 70;
const DEFAULT_MAX_HZ = 1200;
const MIN_RMS = 0.0015;

export type NoteMatch = {
  name: NoteName;
  octave: number;
  midi: number;
  cents: number;
};

export type PitchResult = {
  frequency: number | null;
  confidence: number;
  yin: Float32Array;
  tau: number | null;
};

export type PitchOptions = {
  minHz?: number;
  maxHz?: number;
};

export function midiToHz(midi: number, a4 = DEFAULT_A4_HZ): number {
  return a4 * 2 ** ((midi - A4_MIDI) / 12);
}

export function hzToMidiFloat(frequency: number, a4 = DEFAULT_A4_HZ): number {
  return A4_MIDI + 12 * Math.log2(frequency / a4);
}

export function midiToNoteName(midi: number): { name: NoteName; octave: number } {
  return {
    name: NOTE_NAMES[((midi % 12) + 12) % 12] as NoteName,
    octave: Math.floor(midi / 12) - 1,
  };
}

export function frequencyToNote(frequency: number, a4 = DEFAULT_A4_HZ): NoteMatch {
  const midiFloat = hzToMidiFloat(frequency, a4);
  const midi = Math.round(midiFloat);
  const cents = (midiFloat - midi) * 100;
  return { ...midiToNoteName(midi), midi, cents };
}

export function centsBetween(frequency: number, reference: number): number {
  return 1200 * Math.log2(frequency / reference);
}

export function rms(samples: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export function detectPitchYin(
  samples: ArrayLike<number>,
  sampleRate: number,
  options: PitchOptions = {},
): PitchResult {
  const n = samples.length;
  const half = Math.floor(n / 2);
  const minTau = Math.max(2, Math.floor(sampleRate / (options.maxHz ?? DEFAULT_MAX_HZ)));
  const maxTau = Math.min(half - 1, Math.floor(sampleRate / (options.minHz ?? DEFAULT_MIN_HZ)));
  const size = Math.max(2, Math.min(half, maxTau + 2));
  const yin = new Float32Array(size);
  const empty: PitchResult = { frequency: null, confidence: 0, yin, tau: null };

  if (n < 64 || rms(samples) < MIN_RMS) {
    yin[0] = 1;
    return empty;
  }

  for (let tau = 1; tau < size; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = samples[i] - samples[i + tau];
      sum += delta * delta;
    }
    yin[tau] = sum;
  }

  yin[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < size; tau++) {
    runningSum += yin[tau];
    yin[tau] = runningSum > 0 ? (yin[tau] * tau) / runningSum : 1;
  }

  let tau = minTau;
  let found = false;
  for (; tau < maxTau; tau++) {
    if (yin[tau] < YIN_THRESHOLD) {
      while (tau + 1 < maxTau && yin[tau + 1] < yin[tau]) {
        tau += 1;
      }
      found = true;
      break;
    }
  }

  if (!found) {
    let bestTau = minTau;
    let bestValue = yin[minTau];
    for (let t = minTau + 1; t < maxTau; t++) {
      if (yin[t] < bestValue) {
        bestValue = yin[t];
        bestTau = t;
      }
    }
    if (bestValue > 0.45) {
      return empty;
    }
    tau = bestTau;
  }

  tau = preferLowerOctave(yin, tau, minTau, maxTau);
  const betterTau = interpolateTau(yin, tau);
  const confidence = Math.max(0, Math.min(1, 1 - yin[tau]));

  if (confidence < 0.4) {
    return { ...empty, confidence };
  }

  return { frequency: sampleRate / betterTau, confidence, yin, tau };
}

function preferLowerOctave(yin: Float32Array, tau: number, minTau: number, maxTau: number): number {
  let bestTau = tau;

  for (;;) {
    const current = yin[bestTau] ?? 1;
    if (current <= 0.008) {
      break;
    }

    const center = bestTau * 2;
    if (center >= maxTau) {
      break;
    }

    const candidate = localMinTau(yin, center, minTau, maxTau, 8);
    const value = yin[candidate] ?? 1;
    if (value >= YIN_THRESHOLD || value >= current * 0.5) {
      break;
    }

    bestTau = candidate;
  }

  return bestTau;
}

function localMinTau(
  yin: Float32Array,
  center: number,
  minTau: number,
  maxTau: number,
  radius: number,
): number {
  const from = Math.max(minTau, Math.floor(center - radius));
  const to = Math.min(maxTau - 1, Math.ceil(center + radius));
  let best = Math.min(to, Math.max(from, Math.round(center)));
  let bestValue = yin[best] ?? 1;

  for (let tau = from; tau <= to; tau++) {
    const value = yin[tau] ?? 1;
    if (value < bestValue) {
      bestValue = value;
      best = tau;
    }
  }

  return best;
}

function interpolateTau(yin: Float32Array, tau: number): number {
  if (tau < 1 || tau >= yin.length - 1) {
    return tau;
  }

  const s0 = yin[tau - 1];
  const s1 = yin[tau];
  const s2 = yin[tau + 1];
  const denom = 2 * s1 - s2 - s0;
  if (Math.abs(denom) < 1e-12) {
    return tau;
  }

  return tau + (s2 - s0) / (2 * denom);
}

export function alignOctave(frequency: number, reference: number): number {
  if (frequency <= 0 || reference <= 0) {
    return frequency;
  }

  const octaves = Math.round(Math.log2(frequency / reference));
  if (octaves === 0) {
    return frequency;
  }

  const aligned = frequency / 2 ** octaves;
  const cents = Math.abs(1200 * Math.log2(aligned / reference));
  return cents <= 80 ? aligned : frequency;
}

export type PitchTrackerState = {
  frequency: number | null;
  confidence: number;
  octaveStreak: number;
  silentStreak: number;
};

export function createPitchTracker(): PitchTrackerState {
  return { frequency: null, confidence: 0, octaveStreak: 0, silentStreak: 0 };
}

const SHAKY_LOCK_CONFIDENCE = 0.85;
const RELOCK_CONFIDENCE_MARGIN = 0.08;

/**
 * Holds the locked octave through short runs of octave-flipped detections. A shaky lock (pick
 * attacks often lock the sub-octave) yields at once to a clearly more confident detection.
 */
export function trackPitch(
  frequency: number | null,
  state: PitchTrackerState,
  persistOctaveAfter = 16,
  confidence = 1,
): number | null {
  if (frequency == null) {
    state.octaveStreak = 0;
    state.silentStreak += 1;
    if (state.silentStreak >= 8) {
      state.frequency = null;
    }
    return null;
  }

  state.silentStreak = 0;

  const lock = (next: number, lockConfidence: number) => {
    state.frequency = next;
    state.confidence = lockConfidence;
    state.octaveStreak = 0;
    return next;
  };

  if (state.frequency == null) {
    return lock(frequency, confidence);
  }

  const aligned = alignOctave(frequency, state.frequency);
  const folded = Math.abs(Math.log2(aligned / frequency)) > 0.04;
  if (!folded) {
    return lock(frequency, state.confidence * 0.8 + confidence * 0.2);
  }
  if (
    state.confidence < SHAKY_LOCK_CONFIDENCE &&
    confidence > state.confidence + RELOCK_CONFIDENCE_MARGIN
  ) {
    return lock(frequency, confidence);
  }

  state.octaveStreak += 1;
  if (state.octaveStreak >= persistOctaveAfter) {
    return lock(frequency, confidence);
  }

  state.frequency = aligned;
  return aligned;
}
