// Simple phonetic tables, good enough for search and slugs: «нойз» finds Noize, «лумен» finds LUMEN.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'i',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ъ: '',
  ы: 'y',
  ь: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

// Longest first.
const LATIN_TO_CYRILLIC: [string, string][] = [
  ['shch', 'щ'],
  ['sch', 'щ'],
  ['zh', 'ж'],
  ['ch', 'ч'],
  ['sh', 'ш'],
  ['kh', 'х'],
  ['ts', 'ц'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['yo', 'ё'],
  ['a', 'а'],
  ['b', 'б'],
  ['c', 'к'],
  ['d', 'д'],
  ['e', 'е'],
  ['f', 'ф'],
  ['g', 'г'],
  ['h', 'х'],
  ['i', 'и'],
  ['j', 'дж'],
  ['k', 'к'],
  ['l', 'л'],
  ['m', 'м'],
  ['n', 'н'],
  ['o', 'о'],
  ['p', 'п'],
  ['q', 'к'],
  ['r', 'р'],
  ['s', 'с'],
  ['t', 'т'],
  ['u', 'у'],
  ['v', 'в'],
  ['w', 'в'],
  ['x', 'кс'],
  ['y', 'и'],
  ['z', 'з'],
];

function matchCase(source: string, replacement: string): string {
  if (!replacement || source === source.toLowerCase()) {
    return replacement;
  }
  return replacement[0]?.toUpperCase() + replacement.slice(1);
}

export function toLatin(text: string): string {
  return [...text]
    .map((char) => {
      const latin = CYRILLIC_TO_LATIN[char.toLowerCase()];
      return latin === undefined ? char : matchCase(char, latin);
    })
    .join('');
}

export function toCyrillic(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i).toLowerCase();
    const pair = LATIN_TO_CYRILLIC.find(([latin]) => rest.startsWith(latin));
    if (pair) {
      const source = text.slice(i, i + pair[0].length);
      out += source === source.toUpperCase() ? pair[1].toUpperCase() : matchCase(source, pair[1]);
      i += pair[0].length;
    } else {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** The same text in the other alphabet: Cyrillic becomes Latin and vice versa. */
export function otherScript(text: string): string {
  return /[а-яё]/i.test(text) ? toLatin(text) : toCyrillic(text);
}

/** `Сектор Газа` → `sektor-gaza`; empty when nothing Latin or Cyrillic is left. */
export function slugify(text: string): string {
  return toLatin(text.toLowerCase())
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
