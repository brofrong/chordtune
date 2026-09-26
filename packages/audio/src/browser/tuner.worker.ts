/// <reference lib="webworker" />

import { TunerAnalyzer } from '../analyzer';
import type { WorkerRequest, WorkerResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let analyzer: TunerAnalyzer | null = null;

function post(response: WorkerResponse) {
  const debug = response.frame.debug;
  const transfer = debug
    ? [debug.waveform.buffer, debug.spectrum.buffer, debug.yin.buffer]
    : ([] as ArrayBuffer[]);
  self.postMessage(response, transfer as Transferable[]);
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const message = event.data;
  if (message.type === 'init') {
    const current = new TunerAnalyzer(message.sampleRate, message.settings);
    analyzer = current;
    message.port.onmessage = (chunk: MessageEvent<Float32Array>) => {
      for (const frame of current.push(chunk.data)) {
        post({ type: 'frame', frame });
      }
    };
    return;
  }

  analyzer?.configure(message.settings);
};
