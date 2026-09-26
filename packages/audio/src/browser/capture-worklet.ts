export const CAPTURE_PROCESSOR_NAME = 'chordtune-capture';

const CHUNK_SIZE = 512;

/**
 * Loaded through a Blob URL: bundlers copy `new URL('./x.ts', import.meta.url)` worklet
 * modules verbatim without transpiling them, so the processor has to be plain JS.
 */
const source = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.target = null;
    this.buffer = new Float32Array(${CHUNK_SIZE});
    this.offset = 0;
    this.port.onmessage = (event) => {
      if (event.data && event.data.port) this.target = event.data.port;
    };
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (!channel || !this.target) return true;
    for (let i = 0; i < channel.length; i++) {
      this.buffer[this.offset++] = channel[i];
      if (this.offset === this.buffer.length) {
        this.target.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(${CHUNK_SIZE});
        this.offset = 0;
      }
    }
    return true;
  }
}

registerProcessor('${CAPTURE_PROCESSOR_NAME}', CaptureProcessor);
`;

export function captureWorkletUrl(): string {
  return URL.createObjectURL(new Blob([source], { type: 'application/javascript' }));
}
