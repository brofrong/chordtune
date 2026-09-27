const trimZero = (value: number) => String(value).replace(/\.0$/, '');

/** `999`, `1.2K`, `12K`, `2.5M` — at most three characters before the suffix, rounded down. */
export function formatCount(n: number): string {
  if (n < 1000) {
    return String(n);
  }
  if (n < 10_000) {
    return `${trimZero(Math.floor(n / 100) / 10)}K`;
  }
  if (n < 1_000_000) {
    return `${Math.floor(n / 1000)}K`;
  }
  return `${trimZero(Math.floor(n / 100_000) / 10)}M`;
}
