const COVER_PAIRS = 6;

/** FNV-1a: a small stable hash, so an artist keeps its cover everywhere. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return h >>> 0;
}

/** Gradient stops for an artist cover, from the `--cover-N-a/b` theme tokens. */
export function coverColors(seed: string): [string, string] {
  const n = (hash(seed.toLowerCase()) % COVER_PAIRS) + 1;
  return [`var(--cover-${n}-a)`, `var(--cover-${n}-b)`];
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '') : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
}
