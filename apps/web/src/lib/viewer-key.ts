const VIEWER_KEY = 'chordtune.viewer';

/** A random id for this device, so guest views count once a day like signed-in ones. */
export function viewerKey(): string {
  try {
    let key = localStorage.getItem(VIEWER_KEY);
    if (!key) {
      key = crypto.randomUUID();
      localStorage.setItem(VIEWER_KEY, key);
    }
    return key;
  } catch {
    return crypto.randomUUID();
  }
}
