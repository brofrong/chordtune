const COLORS = [
  'bg-sky-500/20 text-sky-300 ring-sky-400/40',
  'bg-amber-500/20 text-amber-300 ring-amber-400/40',
  'bg-emerald-500/20 text-emerald-300 ring-emerald-400/40',
  'bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-400/40',
  'bg-rose-500/20 text-rose-300 ring-rose-400/40',
  'bg-violet-500/20 text-violet-300 ring-violet-400/40',
  'bg-lime-500/20 text-lime-300 ring-lime-400/40',
  'bg-orange-500/20 text-orange-300 ring-orange-400/40',
];

/** A stable colour per rhythm key, so `@B` looks the same everywhere. */
export function rhythmColor(key: string): string {
  return COLORS[(key.charCodeAt(0) - 65 + COLORS.length) % COLORS.length] ?? COLORS[0] ?? '';
}
