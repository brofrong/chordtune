/** How zen mode shows chords: above the words, or as a fixed strip with the words alone. */
export const ZEN_MODES = ['inline', 'strip'] as const;

export type ZenModeId = (typeof ZEN_MODES)[number];

export function isZenMode(value: unknown): value is ZenModeId {
  return typeof value === 'string' && (ZEN_MODES as readonly string[]).includes(value);
}
