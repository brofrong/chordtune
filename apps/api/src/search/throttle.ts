/**
 * Runs `fn` for a key at once, then at most once more at the end of a `ms` window: the latest
 * call in the window wins. Keeps a burst of likes from re-indexing a song on every tap.
 */
export function createThrottle(ms: number) {
  const windows = new Map<string, { pending: (() => void) | null }>();

  const open = (key: string) => {
    const window = { pending: null as (() => void) | null };
    windows.set(key, window);
    setTimeout(() => {
      windows.delete(key);
      if (window.pending) {
        const run = window.pending;
        open(key);
        run();
      }
    }, ms);
  };

  return (key: string, fn: () => void) => {
    const window = windows.get(key);
    if (window) {
      window.pending = fn;
      return;
    }
    open(key);
    fn();
  };
}
