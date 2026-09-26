import { applyHannWindow, downsampleSigned, fftMagnitudes, spectrumToDbBars } from './fft';
import { analysisGain, applyGain, peakAmplitude, SampleRing } from './pcm';
import {
  createPitchTracker,
  DEFAULT_A4_HZ,
  detectPitchYin,
  frequencyToNote,
  type NoteMatch,
  type PitchTrackerState,
  rms,
  trackPitch,
} from './pitch';
import { analysisWindowSize } from './tunings';

const DEBUG_POINTS = 128;
const SPECTRUM_BARS = 72;
const SPECTRUM_MAX_HZ = 2000;
const JUMP_OCTAVES = 0.08;
const SMOOTHING = 0.55;
const MIN_LEVEL = 0.0008;
const GATE_OVER_FLOOR = 3;
const FLOOR_RISE = 0.01;

export type AnalyzerSettings = {
  a4: number;
  minHz: number;
  maxHz: number;
  debug: boolean;
};

export const DEFAULT_ANALYZER_SETTINGS: AnalyzerSettings = {
  a4: DEFAULT_A4_HZ,
  minHz: 60,
  maxHz: 1200,
  debug: false,
};

export type AnalyzerDebug = {
  waveform: Float32Array;
  spectrum: Float32Array;
  yin: Float32Array;
  yinMarker: number | null;
  fftPeakHz: number;
  appliedGain: number;
  windowSize: number;
  sampleRate: number;
};

export type TunerFrame = {
  frequency: number | null;
  note: NoteMatch | null;
  confidence: number;
  level: number;
  debug: AnalyzerDebug | null;
};

export class TunerAnalyzer {
  private settings: AnalyzerSettings;
  private ring: SampleRing;
  private snapshot: Float32Array;
  private windowed: Float32Array;
  private tracker: PitchTrackerState = createPitchTracker();
  private lastFrequency: number | null = null;
  private noiseFloor = MIN_LEVEL;
  private pending = 0;

  constructor(
    readonly sampleRate: number,
    settings: AnalyzerSettings = DEFAULT_ANALYZER_SETTINGS,
  ) {
    this.settings = settings;
    const size = analysisWindowSize(sampleRate, settings.minHz);
    this.ring = new SampleRing(size);
    this.snapshot = new Float32Array(size);
    this.windowed = new Float32Array(size);
  }

  get windowSize(): number {
    return this.ring.size;
  }

  get hopSize(): number {
    return this.ring.size / 2;
  }

  configure(settings: AnalyzerSettings) {
    const rangeChanged =
      settings.minHz !== this.settings.minHz || settings.maxHz !== this.settings.maxHz;
    this.settings = settings;
    const size = analysisWindowSize(this.sampleRate, settings.minHz);
    if (size !== this.ring.size) {
      this.ring = new SampleRing(size);
      this.snapshot = new Float32Array(size);
      this.windowed = new Float32Array(size);
      this.pending = 0;
    }
    if (rangeChanged) {
      this.reset();
    }
  }

  reset() {
    this.tracker = createPitchTracker();
    this.lastFrequency = null;
    this.noiseFloor = MIN_LEVEL;
  }

  /** Feeds captured PCM; returns one frame per completed hop (usually zero or one). */
  push(chunk: Float32Array): TunerFrame[] {
    const frames: TunerFrame[] = [];
    const hop = this.hopSize;
    let offset = 0;
    while (offset < chunk.length) {
      const take = Math.min(chunk.length - offset, hop - this.pending);
      this.ring.push(chunk.subarray(offset, offset + take));
      this.pending += take;
      offset += take;
      if (this.pending >= hop) {
        this.pending = 0;
        if (this.ring.filled) {
          frames.push(this.analyze());
        }
      }
    }
    return frames;
  }

  private analyze(): TunerFrame {
    const { a4, minHz, maxHz, debug } = this.settings;
    const snapshot = this.snapshot;
    this.ring.snapshot(snapshot);

    const level = rms(snapshot);
    // Gate before auto-gain: boosted room noise yields confident sub-octave pitches, and the
    // octave tracker would then fold the real note onto that wrong octave for a while.
    const gated = level < Math.max(MIN_LEVEL, this.noiseFloor * GATE_OVER_FLOOR);

    const gain = analysisGain(peakAmplitude(snapshot));
    if (gain !== 1) {
      applyGain(snapshot, gain, snapshot);
    }

    const pitch = gated ? null : detectPitchYin(snapshot, this.sampleRate, { minHz, maxHz });
    // The floor only rises on unpitched frames, otherwise a long sustain would gate itself.
    if (level < this.noiseFloor) {
      this.noiseFloor = level;
    } else if (pitch?.frequency == null) {
      this.noiseFloor += (level - this.noiseFloor) * FLOOR_RISE;
    }

    let frequency = trackPitch(
      pitch?.frequency ?? null,
      this.tracker,
      undefined,
      pitch?.confidence,
    );
    if (frequency != null && this.lastFrequency != null) {
      const jumped = Math.abs(Math.log2(frequency / this.lastFrequency)) > JUMP_OCTAVES;
      if (!jumped) {
        frequency = this.lastFrequency * SMOOTHING + frequency * (1 - SMOOTHING);
      }
    }
    this.lastFrequency = frequency;

    return {
      frequency,
      note: frequency == null ? null : frequencyToNote(frequency, a4),
      confidence: pitch?.confidence ?? 0,
      level,
      debug: debug ? this.debugFrame(pitch?.yin ?? null, pitch?.tau ?? null, gain) : null,
    };
  }

  private debugFrame(
    yin: Float32Array | null,
    tau: number | null,
    appliedGain: number,
  ): AnalyzerDebug {
    applyHannWindow(this.snapshot, this.windowed);
    const magnitudes = fftMagnitudes(this.windowed);
    let peakBin = 1;
    for (let i = 2; i < magnitudes.length; i++) {
      if (magnitudes[i] > magnitudes[peakBin]) {
        peakBin = i;
      }
    }

    return {
      waveform: Float32Array.from(downsampleSigned(this.snapshot, DEBUG_POINTS)),
      spectrum: Float32Array.from(
        spectrumToDbBars(magnitudes, this.sampleRate, SPECTRUM_MAX_HZ, SPECTRUM_BARS),
      ),
      yin: Float32Array.from(downsampleSigned(yin ?? [], DEBUG_POINTS)),
      yinMarker: tau == null || yin == null ? null : tau / Math.max(1, yin.length - 1),
      fftPeakHz: (peakBin * this.sampleRate) / this.windowed.length,
      appliedGain,
      windowSize: this.windowed.length,
      sampleRate: this.sampleRate,
    };
  }
}
