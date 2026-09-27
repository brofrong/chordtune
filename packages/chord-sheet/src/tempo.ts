export const MIN_TEMPO = 30;
export const MAX_TEMPO = 300;

export function isTempo(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_TEMPO && value <= MAX_TEMPO;
}
