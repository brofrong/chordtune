/**
 * What a phone's keyboard autocorrect can't ruin: trim, and uppercase only the first letter so
 * `am` becomes `Am` and `hm` becomes `Hm`, but leave the rest exactly as typed — `f#m7` becomes
 * `F#m7`, and `M7` stays `M7` (read as maj7) if that's what the user typed.
 */
export function normalizeChordQuery(text: string): string {
  const trimmed = text.trim();
  return trimmed.slice(0, 1).toUpperCase() + trimmed.slice(1);
}
