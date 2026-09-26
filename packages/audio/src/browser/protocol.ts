import type { AnalyzerSettings, TunerFrame } from '../analyzer';

export type WorkerRequest =
  | { type: 'init'; sampleRate: number; settings: AnalyzerSettings; port: MessagePort }
  | { type: 'settings'; settings: AnalyzerSettings };

export type WorkerResponse = { type: 'frame'; frame: TunerFrame };
