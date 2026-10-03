export type BlockMeta = 'tempo' | 'ts';

const metaRe = (command: BlockMeta) => new RegExp(`^\\s*\\\\${command}\\b\\s*(.*)$`);

/** The argument of `\tempo` / `\ts` in a block, as written. */
export function readBlockMeta(source: readonly string[], command: BlockMeta): string | null {
  const re = metaRe(command);
  for (const line of source) {
    const match = re.exec(line);
    if (match) {
      return (match[1] ?? '').trim();
    }
  }
  return null;
}

/** Sets or replaces the `\tempo` / `\ts` line of a block; `null` removes it. */
export function setBlockMeta(
  source: readonly string[],
  command: BlockMeta,
  value: string | null,
): string[] {
  const re = metaRe(command);
  const index = source.findIndex((line) => re.test(line));
  const line = `\\${command} ${value}`;
  if (index === -1) {
    return value === null ? [...source] : [line, ...source];
  }
  return value === null
    ? source.filter((_, i) => i !== index)
    : source.map((current, i) => (i === index ? line : current));
}
