const HUES = 8;

/** A stable colour per rhythm key (`A`…`P`), from the theme's `--rhythm-N` tokens. */
export function rhythmColor(key: string): string {
  const index = (((key.charCodeAt(0) - 65) % HUES) + HUES) % HUES;
  return `rhythm-chip rhythm-${index + 1}`;
}
