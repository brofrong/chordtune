import type { TunerFrame } from '@chordtune/audio';

type Listener = (frame: TunerFrame) => void;

/**
 * Frames arrive ~45 times a second. Subscribers read them imperatively (motion values, canvas)
 * instead of through React state, so a frame never re-renders the tree by itself.
 */
export class FrameStore {
  private listeners = new Set<Listener>();
  latest: TunerFrame | null = null;

  push(frame: TunerFrame) {
    this.latest = frame;
    for (const listener of this.listeners) {
      listener(frame);
    }
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
