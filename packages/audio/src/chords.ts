export const pitchClassNames = [
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

export type PitchClassName = (typeof pitchClassNames)[number];

export type ChordQuality =
  | 'maj'
  | 'min'
  | '7'
  | 'maj7'
  | 'm7'
  | 'dim'
  | 'aug'
  | 'sus2'
  | 'sus4'
  | '6'
  | 'm6';

export type ChordMatch = {
  label: string;
  root: PitchClassName;
  quality: ChordQuality;
  score: number;
  notes: PitchClassName[];
};

export type ChordDetection = {
  chord: ChordMatch | null;
  candidates: ChordMatch[];
};

const A4_HZ = 440;
const MIN_HZ = 70;
const MAX_HZ = 2000;
const MIN_CHROMA_ENERGY = 0.02;
const MIN_CHORD_SCORE = 0.62;

type QualitySpec = {
  quality: ChordQuality;
  intervals: number[];
  weights: number[];
};

const QUALITIES: QualitySpec[] = [
  { quality: 'maj', intervals: [0, 4, 7], weights: [1, 1, 0.85] },
  { quality: 'min', intervals: [0, 3, 7], weights: [1, 1, 0.85] },
  { quality: '7', intervals: [0, 4, 7, 10], weights: [1, 1, 0.75, 0.9] },
  { quality: 'maj7', intervals: [0, 4, 7, 11], weights: [1, 0.95, 0.7, 0.9] },
  { quality: 'm7', intervals: [0, 3, 7, 10], weights: [1, 1, 0.75, 0.9] },
  { quality: 'dim', intervals: [0, 3, 6], weights: [1, 1, 0.9] },
  { quality: 'aug', intervals: [0, 4, 8], weights: [1, 1, 0.9] },
  { quality: 'sus2', intervals: [0, 2, 7], weights: [1, 0.95, 0.85] },
  { quality: 'sus4', intervals: [0, 5, 7], weights: [1, 0.95, 0.85] },
  { quality: '6', intervals: [0, 4, 7, 9], weights: [1, 0.95, 0.7, 0.85] },
  { quality: 'm6', intervals: [0, 3, 7, 9], weights: [1, 0.95, 0.7, 0.85] },
];

export function chromaFromMagnitudes(
  magnitudes: ArrayLike<number>,
  sampleRate: number,
): Float32Array {
  const chroma = new Float32Array(12);
  const fftSize = magnitudes.length * 2;
  const binHz = sampleRate / fftSize;
  const peaks = spectralPeaks(magnitudes, binHz);

  for (const peak of peaks) {
    const midi = 69 + 12 * Math.log2(peak.frequency / A4_HZ);
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
    chroma[pitchClass] += Math.log1p(peak.magnitude * 30);
  }

  normalizeL2(chroma);
  return chroma;
}

export function detectChord(chroma: ArrayLike<number>, limit = 3): ChordDetection {
  let energy = 0;
  let peak = 0;
  for (let i = 0; i < 12; i++) {
    energy += chroma[i] ?? 0;
    if ((chroma[i] ?? 0) > peak) {
      peak = chroma[i] ?? 0;
    }
  }

  if (energy < MIN_CHROMA_ENERGY || peak < MIN_CHROMA_ENERGY) {
    return { chord: null, candidates: [] };
  }

  const scored: ChordMatch[] = [];
  for (let root = 0; root < 12; root++) {
    for (const spec of QUALITIES) {
      const template = new Float32Array(12);
      const notes = spec.intervals.map((interval) => {
        const pc = (root + interval) % 12;
        template[pc] = spec.weights[spec.intervals.indexOf(interval)] ?? 1;
        return pitchClassNames[pc];
      });

      let score = cosineSimilarity(chroma, template);
      score -= outsiderPenalty(chroma, template) * 0.22;
      score -= missingTonePenalty(chroma, spec, root) * 0.25;
      score += extraToneBonus(chroma, spec, root) * 0.1;

      scored.push({
        label: formatChordLabel(pitchClassNames[root], spec.quality),
        root: pitchClassNames[root],
        quality: spec.quality,
        score,
        notes,
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, limit).map((item) => ({
    ...item,
    score: clamp01(item.score),
  }));
  const best = candidates[0];

  return {
    chord: best && best.score >= MIN_CHORD_SCORE ? best : null,
    candidates,
  };
}

export function activePitchClasses(chroma: ArrayLike<number>): PitchClassName[] {
  let peak = 0;
  for (let i = 0; i < 12; i++) {
    if ((chroma[i] ?? 0) > peak) {
      peak = chroma[i] ?? 0;
    }
  }

  if (peak < 0.08) {
    return [];
  }

  const names: PitchClassName[] = [];
  for (let i = 0; i < 12; i++) {
    if ((chroma[i] ?? 0) >= Math.max(0.16, peak * 0.42)) {
      names.push(pitchClassNames[i]);
    }
  }
  return names;
}

function spectralPeaks(
  magnitudes: ArrayLike<number>,
  binHz: number,
): { frequency: number; magnitude: number }[] {
  let maxMagnitude = 0;
  for (let i = 1; i < magnitudes.length - 1; i++) {
    if ((magnitudes[i] ?? 0) > maxMagnitude) {
      maxMagnitude = magnitudes[i] ?? 0;
    }
  }

  const threshold = maxMagnitude * 0.12;
  const peaks: { frequency: number; magnitude: number }[] = [];

  for (let i = 2; i < magnitudes.length - 2; i++) {
    const magnitude = magnitudes[i] ?? 0;
    if (magnitude < threshold) {
      continue;
    }
    if (magnitude < (magnitudes[i - 1] ?? 0) || magnitude < (magnitudes[i + 1] ?? 0)) {
      continue;
    }

    const frequency = interpolatedFrequency(magnitudes, i, binHz);
    if (frequency < MIN_HZ || frequency > MAX_HZ) {
      continue;
    }

    peaks.push({ frequency, magnitude });
  }

  return peaks;
}

function interpolatedFrequency(
  magnitudes: ArrayLike<number>,
  index: number,
  binHz: number,
): number {
  const alpha = magnitudes[index - 1] ?? 0;
  const beta = magnitudes[index] ?? 0;
  const gamma = magnitudes[index + 1] ?? 0;
  const denom = alpha - 2 * beta + gamma;
  const shift = Math.abs(denom) < 1e-12 ? 0 : (0.5 * (alpha - gamma)) / denom;
  return (index + shift) * binHz;
}

function missingTonePenalty(chroma: ArrayLike<number>, spec: QualitySpec, root: number): number {
  if (spec.intervals.length <= 3) {
    return 0;
  }

  const extras = spec.intervals.slice(3);
  let missing = 0;
  for (const interval of extras) {
    if ((chroma[(root + interval) % 12] ?? 0) < 0.14) {
      missing += 1;
    }
  }
  return extras.length === 0 ? 0 : missing / extras.length;
}

function normalizeL2(values: Float32Array) {
  let sumSquares = 0;
  for (let i = 0; i < values.length; i++) {
    sumSquares += values[i] * values[i];
  }
  const norm = Math.sqrt(sumSquares);
  if (norm < 1e-12) {
    return;
  }
  for (let i = 0; i < values.length; i++) {
    values[i] /= norm;
  }
}

function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < 12; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom < 1e-12 ? 0 : dot / denom;
}

function outsiderPenalty(chroma: ArrayLike<number>, template: ArrayLike<number>): number {
  let outsider = 0;
  let total = 0;
  for (let i = 0; i < 12; i++) {
    const energy = chroma[i] ?? 0;
    total += energy;
    if ((template[i] ?? 0) <= 0) {
      outsider += energy;
    }
  }
  return total < 1e-12 ? 0 : outsider / total;
}

function extraToneBonus(chroma: ArrayLike<number>, spec: QualitySpec, root: number): number {
  if (spec.intervals.length <= 3) {
    return 0;
  }

  const extras = spec.intervals.slice(3);
  let present = 0;
  for (const interval of extras) {
    if ((chroma[(root + interval) % 12] ?? 0) > 0.12) {
      present += 1;
    }
  }
  return extras.length === 0 ? 0 : present / extras.length;
}

function formatChordLabel(root: PitchClassName, quality: ChordQuality): string {
  switch (quality) {
    case 'maj':
      return root;
    case 'min':
      return `${root}m`;
    case '7':
      return `${root}7`;
    case 'maj7':
      return `${root}maj7`;
    case 'm7':
      return `${root}m7`;
    case 'dim':
      return `${root}dim`;
    case 'aug':
      return `${root}aug`;
    case 'sus2':
      return `${root}sus2`;
    case 'sus4':
      return `${root}sus4`;
    case '6':
      return `${root}6`;
    case 'm6':
      return `${root}m6`;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
