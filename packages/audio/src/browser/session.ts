import type { AnalyzerSettings, TunerFrame } from '../analyzer';
import { CAPTURE_PROCESSOR_NAME, captureWorkletUrl } from './capture-worklet';
import type { WorkerRequest, WorkerResponse } from './protocol';

export type TunerErrorCode = 'unsupported' | 'permission-denied' | 'no-device' | 'unknown';

export class TunerError extends Error {
  constructor(
    readonly code: TunerErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'TunerError';
  }
}

export type TunerSession = {
  readonly sampleRate: number;
  update(settings: AnalyzerSettings): void;
  stop(): void;
};

export type StartTunerOptions = {
  settings: AnalyzerSettings;
  onFrame: (frame: TunerFrame) => void;
};

export async function startTunerSession({
  settings,
  onFrame,
}: StartTunerOptions): Promise<TunerSession> {
  if (
    typeof window === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia ||
    typeof AudioWorkletNode === 'undefined'
  ) {
    throw new TunerError('unsupported');
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1,
      },
    });
  } catch (error) {
    throw toTunerError(error);
  }

  const context = new AudioContext({ latencyHint: 'interactive' });
  const worker = new Worker(new URL('./tuner.worker.ts', import.meta.url), { type: 'module' });
  const workletUrl = captureWorkletUrl();

  const stop = () => {
    for (const track of stream.getTracks()) {
      track.stop();
    }
    worker.terminate();
    URL.revokeObjectURL(workletUrl);
    if (context.state !== 'closed') {
      void context.close();
    }
  };

  try {
    await context.audioWorklet.addModule(workletUrl);
    if (context.state === 'suspended') {
      await context.resume();
    }

    const source = context.createMediaStreamSource(stream);
    const capture = new AudioWorkletNode(context, CAPTURE_PROCESSOR_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      channelCount: 1,
      channelCountMode: 'explicit',
    });
    source.connect(capture);
    // Nothing is written to the output; the connection only keeps the node in the render graph.
    capture.connect(context.destination);

    const channel = new MessageChannel();
    capture.port.postMessage({ port: channel.port1 }, [channel.port1]);

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      onFrame(event.data.frame);
    };
    const init: WorkerRequest = {
      type: 'init',
      sampleRate: context.sampleRate,
      settings,
      port: channel.port2,
    };
    worker.postMessage(init, [channel.port2]);
  } catch (error) {
    stop();
    throw toTunerError(error);
  }

  return {
    sampleRate: context.sampleRate,
    update(next) {
      const message: WorkerRequest = { type: 'settings', settings: next };
      worker.postMessage(message);
    },
    stop,
  };
}

function toTunerError(error: unknown): TunerError {
  if (error instanceof TunerError) {
    return error;
  }
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new TunerError('permission-denied');
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return new TunerError('no-device');
  }
  return new TunerError('unknown', error instanceof Error ? error.message : String(error));
}
