# Song editor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Экран «Новая песня»: исполнитель и название с автокомплитом (Meilisearch, опечатки,
транслит), редактор аккордов с двумя режимами (текст «аккорды над строкой» ↔ визуальный), ритм
(бой/перебор) с пресетами, своими паттернами, привязкой хоть к каждому такту и прослушиванием.
Пять песен из Obsidian загружаются seed-скриптом.

**Architecture:** `packages/chord-sheet` — чистый TS без зависимостей: аккорды, парсер/сериализатор,
конвертация «аккорды над строкой», ритм, импорт Obsidian, лента аккордов. `packages/audio` — подбор
аппликатур и расписание нот (чистые функции, тестируются) + браузерный плеер. `apps/api` — Drizzle-
таблицы, Meilisearch, tRPC. `apps/web` — вход, форма, редакторы, страница песни.

**Tech Stack:** Bun 1.4 (`bun test`), Turborepo, Biome, TypeScript 6, Drizzle ORM 1.0 RC (relations v2),
PostgreSQL 18, Meilisearch (JS-клиент `meilisearch`), Hono + tRPC 11, Better Auth 1.7, Next.js 16
(App Router, React 19, React Compiler), Base UI 1.8 + shadcn (style `base-nova`), Tailwind v4, next-intl
(ru/en), Capacitor 8.

Дизайн (что и зачем): `docs/plans/2026-09-26-song-editor-design.md`. Общий дизайн проекта:
`docs/plans/2026-09-26-chordtune-design.md`.

---

## 0. Прочитай перед началом

### Состояние

- Ветка `feat/song-editor` (от `main`). Закоммичен только дизайн-документ.
- **Task 1 сделан, но не закоммичен**: `packages/chord-sheet/{package.json,tsconfig.json}`,
  `src/chord.ts`, `src/chord.test.ts` (6 тестов проходят), фикстуры
  `packages/chord-sheet/fixtures/obsidian/*.md`. Начни с `git status` и закоммить их.
- `bun install` после добавления пакета ещё не выполнен (см. ниже), поэтому
  `node_modules/@chordtune/chord-sheet` может отсутствовать. Запусти `bun install` из корня.

### Окружение и грабли

- Песочница агента в прошлой сессии блокировала: `bun install` (EPERM на tempdir и 403 на
  registry.npmjs.org), Docker (сокет OrbStack). Если у тебя так же — попроси пользователя выполнить
  `bun install` / `bun run db:up`, не обходи песочницу.
- Postgres и Meilisearch поднимаются через `docker compose` (`bun run db:up`). Миграции:
  `cd apps/api && bun run db:generate && bun run db:migrate`.
- `apps/web/AGENTS.md`: Next.js 16 отличается от того, что ты помнишь. **Перед кодом страниц читай
  `apps/web/node_modules/next/dist/docs/`** (App Router: dynamic routes, `generateStaticParams`,
  static export).
- Две сборки web: `BUILD_TARGET=web` (SSR) и `BUILD_TARGET=capacitor` (`output: 'export'`). В коде
  страниц нельзя: middleware, route handlers, `cookies()`/`headers()`. Динамические сегменты в export
  требуют `generateStaticParams`, поэтому страница песни в приложении — `/[locale]/song?id=…`
  (клиентская), на вебе — `/[locale]/songs/[slug]` (SSR). Обе рендерят один клиентский компонент.
- Web импортирует из `apps/api` **только типы** (`import type { AppRouter } from '@chordtune/api'`).
- Новые workspace-пакеты, которые импортирует web, добавь в `transpilePackages` в
  `apps/web/next.config.ts` и в `dependencies` web (`"@chordtune/chord-sheet": "workspace:*"`).
- Стиль: Biome (одинарные кавычки, точки с запятой, ширина 100, 2 пробела). `bun run lint`.
  `noUncheckedIndexedAccess` включён в base tsconfig, выключен в `packages/audio` и `apps/web`.
- UI-компоненты: Base UI (`@base-ui/react/*`: combobox, autocomplete, popover, dialog, drawer,
  toggle-group, tabs, number-field …), обёртки shadcn в `apps/web/src/components/ui`. Новые обёртки
  добавляй в том же стиле (см. `sheet.tsx`, `select.tsx`).
- i18n: все строки UI через `next-intl`, ключи в `apps/web/messages/{ru,en}.json`.
- Пользователь сам проверяет UI в браузере — **скриншоты как результат не нужны**. В конце дай
  команды запуска.
- Коммить после каждой задачи, сообщения на английском, в конце сообщения строка
  `Co-Authored-By: …` согласно инструкциям окружения.

---

## 1. Формат песни (зафиксировано)

Исходный текст — источник правды (колонка `arrangement.content`):

```
{key: value}                  метаданные (необязательно; title/artist хранятся в БД)
[Куплет 1] @B                 раздел; @B в заголовке = метка ритма в начале раздела
|${Am}Зачем кричать, ${G}когда никто не ${F}слышит|
${G} ${B} ${C} ${Cm} ${x4}    инструментальная строка с повтором ×4
@A ${Dm}Что ей снится…        метка ритма перед аккордом
{start_of_tab}
e|---0---|
{end_of_tab}
просто текст
```

- `${Chord}` — аккорд, стоит перед слогом, к которому относится.
- `|` — граница такта. Необязательна.
- `@X` (`X` — `[A-Z]`) — смена ритма на паттерн с ключом `X`. **Действует до следующей метки,
  переходит между разделами.** До первой метки играет первый паттерн списка.
- `${x4}` — повтор: аккорды строки от её начала (или от предыдущего повтора) играются 4 раза.
- `{start_of_tab}` … `{end_of_tab}` — табулатура, строки внутри не разбираются, рендер моноширинно.
- Пустые строки сохраняются (разделяют строфы).
- `H` → `B` (немецкая нотация). `B` = си, не си-бемоль.

AST (`packages/chord-sheet/src/types.ts`):

```ts
export type Item =
  | { type: 'chord'; chord: string } // raw, как написано
  | { type: 'text'; text: string }
  | { type: 'bar' }
  | { type: 'rhythm'; key: string }
  | { type: 'repeat'; times: number };

export type Line =
  | { type: 'line'; items: Item[] } // строка без chord/bar/rhythm/repeat = обычный текст
  | { type: 'tab'; lines: string[] };

export type Section = { label: string | null; rhythm: string | null; lines: Line[] };
export type SongDoc = { meta: Record<string, string>; sections: Section[] };
export type Diagnostic = { line: number; col: number; severity: 'warning' | 'error'; message: string };
```

Строки до первого `[…]` попадают в раздел с `label: null`.

### «Аккорды над строкой» (текстовый режим редактора)

```
[Куплет 1] @B
Am        G                  F
Зачем кричать, когда никто не слышит
G B C Cm x4
```

- Строка аккордов: все токены через пробелы — аккорды (`parseChord`), `|`, `@X` или повтор
  (`x4`, `×4`, `(x4)`, `}x4`, `x4}`). Минимум один аккорд или `|`.
- Колонка токена = позиция в следующей строке текста. Если после строки аккордов идёт не текст
  (другая строка аккордов, пустая, заголовок, конец), это инструментальная строка: текст — пробелы
  до колонок.
- При выводе, если аккорды не помещаются (`F#m7` на колонке 5, следующий на 7), следующий токен
  сдвигается вправо с отступом 1 пробел. Поэтому преобразование идемпотентно после первого прохода,
  а не строго без потерь — это ок.
- Если строка текста длиннее последнего аккорда — ничего, если аккорд правее конца текста — текст
  дополняется пробелами.
- Табы: 2+ подряд строк, похожих на табулатуру (`/^\s*[eBGDAEbgdah]?\|?[-\d|~hpbrx\/\\ ]{6,}\|?\s*$/`
  и содержит `---`), оборачиваются в tab-блок.

---

## 2. Ритм (зафиксировано)

```ts
export type Stroke = 'D' | 'U' | 'd' | 'u' | 'x'; // ↓ ↑ ⇣(глушёный вниз) ⇡ x(удар с глушением)
export type StringRef = 'B' | "B'" | 1 | 2 | 3 | 4 | 5 | 6; // B = бас аккорда, B' = чередующийся бас
export type Step = { stroke?: Stroke; strings?: StringRef[]; accent?: boolean } | null; // null = пауза
export type Rhythm = {
  key: string; // 'A', 'B', …
  name: string;
  kind: 'strum' | 'pick';
  time: '4/4' | '3/4' | '6/8';
  steps: Step[]; // равномерно на такт; длина — любая 1..32 (обычно 4, 6, 8, 12, 16)
};
```

Хранится в `arrangement.rhythms` (jsonb, ≤ 16 паттернов). Длительность такта в четвертях:
4/4 → 4, 3/4 → 3, 6/8 → 3. BPM — четверти.

Бас аккорда (`B`) — самая низкая звучащая струна аппликатуры; `B'` — следующая звучащая струна
выше неё, если это другая нота, иначе та же.

**Пресеты** (`src/rhythm-presets.ts`, `id`, `name` для ru; en-названия — в i18n web по `id`).
Штрихи шестёрки и восьмёрки взяты из заметок пользователя (самые частые записи):

| id | name | kind | time | steps |
| --- | --- | --- | --- | --- |
| `down-4` | Вниз по долям | strum | 4/4 | `D D D D` |
| `four` | Четвёрка | strum | 4/4 | `D U D U`, акцент на 1 и 3 |
| `six` | Шестёрка | strum | 4/4 | `D - D U - U D U` |
| `six-muted` | Шестёрка с глушением | strum | 4/4 | `D - x U - U x U` |
| `eight` | Восьмёрка | strum | 4/4 | `D D U U D D D U` |
| `waltz` | Вальс | strum | 3/4 | `D - D U D U` |
| `pick-four` | Перебор «четвёрка» | pick | 4/4 | `B 3 2 3 B 3 2 3` |
| `pick-eight` | Перебор «восьмёрка» | pick | 4/4 | `B 3 2 3 1 3 2 3` |
| `pick-three` | Перебор «тройка» | pick | 3/4 | `B 3 2 1 2 3` |
| `pinch` | Щипок | pick | 4/4 | `B [1,2,3] B' [1,2,3]` |

**Разбор записи боя** `parseStrumNotation(s)`: `↓`→D, `↑`→U, `⇣`→d, `⇡`→u, `x`/`×`→x,
`·`/`-`→пауза, `\↓/` → D с акцентом; пробелы игнорируются. Если последовательность штрихов (без пауз)
совпадает со штрихами пресета — вернуть копию пресета (`↓↓↑↑↓↑` → Шестёрка). Иначе — шаги подряд,
`time: '4/4'`. Слова `шестёрка/шестерка`, `восьмёрка/восьмерка`, `четвёрка` → соответствующий пресет.

**Разбор перебора** `parsePickNotation(s)`: разделители `-`, `—`, `–`, `|`, пробел; `Б`/`б`/`B` → `'B'`,
цифры 1–6 → струна, многозначный токен (`12`) → несколько струн (щипок). Пример
`б-3-12-3` → `[B] [3] [1,2] [3]`.

---

## 3. Лента аккордов (для плеера и будущего режима «следить за игрой»)

```ts
export type TimelineEvent = {
  chord: string;
  rhythm: string | null; // ключ паттерна
  bar: number; // номер такта с 0
  start: number; // начало в тактах (дробное)
  length: number; // длина в тактах
  section: number;
  line: number;
  item: number; // индекс item аккорда в строке
};
export function timeline(doc: SongDoc, rhythms: Rhythm[]): TimelineEvent[];
export function chordList(doc: SongDoc): string[]; // уникальные, в порядке появления
```

- Строка без `|`: каждый аккорд = 1 такт.
- Строка с `|`: группы между чертами = такты, аккорды в группе делят такт поровну. Группа без
  аккордов, но с непустым текстом — 1 такт предыдущего аккорда. Пустые группы пропускаются.
- `repeat` повторяет события строки (от начала или прошлого повтора) `times - 1` раз.
- Метка `@X` меняет текущий ритм для последующих событий; заголовок `@X` — то же в начале раздела.

---

## 4. Задачи

Каждая задача: тест → красный → код → зелёный → `bun run lint` → коммит.

### Task 1: аккорды — ГОТОВО (закоммитить)

`src/chord.ts`: `parseChord`, `isChord`, `pitchClass`, `chordTones` (intervals для m, 7, maj7, m7, dim,
dim7, ø, m7b5, aug/+, sus2/sus4, 5, 6, m6, 9, add9, 11, 13, b9/#9/#11/b13, слэш-бас).

### Task 2: парсер и сериализатор

Files: `src/types.ts`, `src/parse.ts`, `src/serialize.ts`, `src/parse.test.ts`, `src/index.ts`
(ре-экспорт всего публичного API).

- `parse(source): { doc: SongDoc; diagnostics: Diagnostic[] }`. Никогда не бросает.
  Warning: `${Xyz}` не аккорд. Error: незакрытый `${`, незакрытый `{start_of_tab}`.
- `serialize(doc): string`.
- `validate(doc, rhythms): Diagnostic[]` — error на `@X` без паттерна `X`.
- Тесты: разбор примера из раздела 1 целиком (сравнить AST), round-trip `serialize(parse(s)) === s`
  для него и для всех песен после импорта (Task 5), диагностики.

### Task 3: «аккорды над строкой»

Files: `src/chords-over-lyrics.ts` + тест.

- `toChordsOverLyrics(doc): string`, `fromChordsOverLyrics(text): { doc, diagnostics }`,
  `isChordLine(line): boolean`.
- Тесты: `fromChordsOverLyrics` на блоке ```` ```chords ```` из Creep → проверить позиции аккордов
  в первой строке куплета; `toChordsOverLyrics(fromChordsOverLyrics(x))` стабилен после 1-го прохода
  на всех 5 фикстурах; табы из Кошки становятся tab-блоком; `E C#m G# A }x4` → 4 аккорда + repeat 4.

### Task 4: ритм

Files: `src/rhythm.ts` (типы, `parseStrumNotation`, `parsePickNotation`, `isRhythm` — ручная
валидация, `strumSymbols(rhythm)` для отображения `↓ · ↓ ↑`), `src/rhythm-presets.ts` + тест.

- Тесты: все записи из таблицы/раздела 2; `'↓↓\↓/↓↑ ↓↓\↓/↓↑'` даёт акценты; `'Б-3-2-3-1-3-2-3'`,
  `'б—3—2|1—3'`, `'б-3-12-3'`.

### Task 5: импорт Obsidian

Files: `src/import-obsidian.ts` + тест на `fixtures/obsidian/*.md`.

```ts
export type ImportedSong = {
  artist: string; title: string; content: string; // content — во внутреннем формате
  rhythms: Rhythm[]; capo: number | null; tempo: number | null; notes: string;
  diagnostics: Diagnostic[];
};
export function importObsidian(markdown: string, fileName?: string): ImportedSong;
```

- Артист/название: первая строка `#Артист - Название` / `# Артист — Название` (разделители `-`, `—`,
  `–`), иначе имя файла без `.md`. Для `LUMEN - Гореть.md` заголовка нет — берётся имя файла.
- Мета-строки (вне и внутри блока chords): `Каподастр: 4 лад` → capo; `BPM: 90` → tempo (пусто —
  null); `Паттерн:`/`Паттерн гитары:`/`Бой:`/`Перебор:` → паттерн (`неизвестен`/пусто — пропуск).
  Если мета-строка ритма стоит внутри раздела (Лирика: `Припев:` → `Бой: ↓↓↓ ↓↑`), добавить паттерн и
  поставить метку `@X` на этот раздел. `[бой:] ↓ ↓ ↑ ↑↓ ↓↑↓↑` (Гореть) — тоже паттерн, не раздел.
- Разделы: `[Куплет 1]` как есть; строка `Куплет 1:`/`Припев:`/`Вступление:`/`Проигрыш:`/`Бридж:`/
  `Кода:`/`Аутро:`/`Интро:` (регистр любой, номер необязателен) → `[…]`; `Вступление: F#m E Bm` →
  раздел + строка аккордов.
- Содержимое: только блок(и) ```` ```chords ````, конвертация через `fromChordsOverLyrics`.
  Всё прочее (jtab-блоки, `**Проигрыш**`, `src: […](…)`) → `notes`.
- Ожидания по фикстурам: Creep — 4 аккорда G B C Cm, ритма нет; Кошка — Dm A# F A7, tab-блок;
  Where Is My Mind — паттерн из `↓↓\↓/↓↑…` с акцентами, повтор ×4 во вступлении; Гореть — паттерн
  из `[бой:]`, раздел outro `F Am G F | Am G F`; Лирика — паттерн A перебор `Б-3-2-3-1-3-2-3`,
  паттерн B бой `↓↓↓ ↓↑`, у припевов метка `@B`, у куплета 2 метка `@A` (ритм возвращается —
  импортёр ставит метку на первый раздел после ритмованного раздела, если в оригинале ритм не
  указан, а пред. раздел имел другой ритм — **упрощение: ставь `@A` на разделы с тем же названием,
  что и первый раздел с перебором**; если это сложно — оставь без метки и отметь в notes).

### Task 6: лента

Files: `src/timeline.ts` + тест. Правила в разделе 3. Тесты: `|${Am}a ${G}b|${F}c|` → Am 0–0.5,
G 0.5–1, F 1–2; строка без черт; repeat; метки ритма через границы разделов; пустая группа держит
аккорд.

### Task 7: аппликатуры и расписание нот (`packages/audio`)

Добавь `"@chordtune/chord-sheet": "workspace:*"` в `packages/audio/package.json`.

Files: `src/voicing.ts`, `src/voicing.test.ts`, `src/strum-schedule.ts`, `src/strum-schedule.test.ts`;
в `src/guitar-synth.ts` экспортируй `synthesizePluck(frequency, { sampleRate, durationSec, seed })`
(обёртка над существующим `pluckedString` + `applyEnvelope`).

- `voicingFor(chordRaw: string): GuitarFrets | null`: сначала `CHORD_CATALOG` по точной метке
  (`A#` и `Bb` — одна и та же, нормализуй через pitch class), иначе поиск: окна ладов s = 0..9,
  на струне варианты `null`, `0`, `s..s+3`, только если нота ∈ тонам аккорда; условия: все тона
  покрыты (для 4+ нот можно без квинты), самая низкая звучащая нота = бас (слэш) или тоника, нет
  заглушённых струн между звучащими, ≥4 звучащих струн. Стоимость: растяжка, номер лада, число
  заглушённых, бонус открытым. Кеш по `raw`.
- Тест: для всех 12 тоник × (`''`, `m`, `7`, `m7`, `maj7`, `sus4`, `dim`, `6`) — аппликатура есть,
  все тона присутствуют, растяжка ≤ 3; `D/F#` — бас F#.
- `scheduleNotes(events, rhythms, { bpm, voicing }): ScheduledNote[]`,
  `ScheduledNote = { time: number; midi: number; string: 1..6; gain: number; muted: boolean }`
  (время в секундах). Шаг паттерна с позицией внутри такта попадает в событие, если
  `event.start <= bar + stepPos < event.start + event.length`. Бой: D — струны 6→1 с разбросом 10 мс
  (только звучащие), U — 1→6, вверх громкость 0.8 и только 3–4 верхние струны; `d`/`u` —
  `muted: true`; `x` — все струны muted; акцент ×1.3. Перебор: `B`/`B'`/номера струн (если струна
  заглушена в аппликатуре — пропустить).
- Тест: шестёрка при BPM 60 на одном такте Am — моменты начала штрихов
  `[0, 1, 1.5, 2.5, 3, 3.5]` с; порядок струн в D и U.

### Task 8: браузерный плеер

Files: `packages/audio/src/browser/strum-player.ts`, экспорт из `src/browser/index.ts`.

```ts
export type StrumPlayer = {
  play(notes: ScheduledNote[], opts: { loopSec?: number; onTick?: (sec: number) => void }): Promise<void>;
  stop(): void;
};
export function createStrumPlayer(): StrumPlayer;
```

Общий `AudioContext` (как в `tone.ts`), кеш `AudioBuffer` по midi, на каждую струну свой `GainNode`:
новый удар по струне гасит предыдущий (ramp 15 мс), muted — ramp до 0 за 40 мс + короткий шумовой
щелчок. Планирование окнами по 200 мс через `setInterval` (lookahead), loop — если `loopSec`.
`onTick` через `requestAnimationFrame`.

### Task 9: API — схема

`apps/api/src/db/schema.ts` (`pgTable`, `defineRelations` для своих таблиц, `authRelations` в конце —
см. комментарий в файле):

- `artist`: id text pk (`crypto.randomUUID()`), name, slug unique, createdAt; уникальный индекс
  `lower(name)`.
- `song`: id, artistId → artist, title, slug, createdAt; unique (artistId, slug).
- `arrangement`: id, songId → song, authorId → user, content text, rhythms jsonb `$type<Rhythm[]>()`,
  chords text[], key text null, capo int null, tempo int null, notes text default '',
  status `draft|published` default published, createdAt, updatedAt.
- Слаг: транслит + kebab-case (`translit.ts` из Task 10, положи в `apps/api/src/lib/`).
- `bun run db:generate` (миграция в `apps/api/drizzle/`).

### Task 10: API — Meilisearch

- `docker-compose.yml`: сервис `meilisearch` (`getmeili/meilisearch:v1.x`, порт 7700,
  `MEILI_MASTER_KEY`, volume). `db:up` → `docker compose up -d postgres meilisearch`.
- `.env.example` / `env.ts`: `MEILI_URL=http://localhost:7700`, `MEILI_KEY=…`.
- Зависимость `meilisearch` в `apps/api`.
- `src/search/index.ts`: интерфейс `SearchIndex { upsertArrangement, upsertArtist, searchArtists,
  searchSongs(artistId, q), search(q), reindexAll }` + реализация на Meili + `noopSearch` для тестов.
- Индекс `artists`: `{ id, name, nameTranslit, songCount }`, searchable `[name, nameTranslit]`.
- Индекс `arrangements`: `{ id, songId, songSlug, artistId, artist, artistTranslit, title,
  titleTranslit, lyrics, chords }`; `searchableAttributes: [artist, artistTranslit, title,
  titleTranslit, lyrics]` (порядок = вес: текст песни слабейший), `filterableAttributes:
  [artistId, chords]`. `lyrics` — текст без аккордов (из AST).
- `src/lib/translit.ts`: кириллица ↔ латиница (`лумен` ↔ `lumen`, `нойз` → `noiz`; для латиницы
  → кириллица простая таблица `sh→ш, ch→ч, zh→ж, …`). Тест.
- `src/scripts/reindex.ts`, скрипт `search:reindex` в `apps/api/package.json`.
- Запись в Meili — после коммита транзакции; ошибка логируется и не ломает сохранение.

### Task 11: API — роутеры

`src/trpc/routers/{artists,songs,arrangements,search}.ts`, собрать в `router.ts`.

- `artists.search({ q })` → топ-8 из Meili (`{ id, name, songCount }`).
- `songs.searchByArtist({ artistId, q })` → песни исполнителя.
- `search.query({ q })` → разборы для страницы «Песни».
- `songs.list()` → последние 20 разборов из Postgres.
- `arrangements.byId({ id })`, `arrangements.bySlug({ artistSlug, songSlug })` — public.
- `arrangements.create(input)` — protected; zod: `artist: { id } | { name }`, `song: { id } |
  { title }`, `content ≤ 50_000`, `rhythms ≤ 16` (`z.custom(isRhythm)`), capo 0–12, tempo 30–300, key.
  Сервис `src/services/save-arrangement.ts`: транзакция, поиск исполнителя по `lower(name)` перед
  созданием, `parse`+`validate` (error → `BAD_REQUEST`), `chords = chordList(doc)`.
- `arrangements.update` — только автор (`FORBIDDEN`).
- Тест сервиса на PGlite (`@electric-sql/pglite` + `drizzle-orm/pglite`, миграции из `drizzle/`):
  создание нового исполнителя/песни, дедупликация `noize mc` vs `Noize MC`, error при `@C`.

### Task 12: seed

`src/scripts/seed.ts`, скрипт `db:seed`: пользователь `demo@chordtune.local` / `demo-password-123`
(через `auth.api.signUpEmail`, если нет), затем `importObsidian` для каждого файла из
`packages/chord-sheet/fixtures/obsidian/` (или директории из аргумента) → `saveArrangement` →
`reindexAll`. Идемпотентно (песня с тем же artist+slug пропускается).

### Task 13: web — вход

`features/auth/auth-sheet.tsx` (email + пароль, вкладки вход/регистрация, `authClient.signIn.email` /
`signUp.email`), `features/auth/use-session.ts` (`authClient.useSession`). Кнопка входа/аватар в шапке
`app-shell.tsx`. Токен уже сохраняется через `onSuccess` в `lib/auth-client.ts`.

### Task 14: web — форма и автокомплит

`app/[locale]/songs/new/page.tsx` (серверная оболочка + клиентский `SongForm`),
`features/editor/{song-form,artist-combobox,song-combobox,use-draft}.tsx`.

- Base UI `Combobox`/`Autocomplete`, debounce 150 мс, `useQuery(trpc.artists.search…)`, последний
  пункт «+ Создать «…»», клавиатура. Название — подсказки из `songs.searchByArtist`.
- Поля: каподастр (0–12), BPM, тональность (необязательно).
- Черновик в `localStorage` (`chordtune.draft.new`). Без входа «Сохранить» открывает auth-sheet.
- Кнопка «Добавить песню» на странице `/songs`.

### Task 15: web — редакторы аккордов

`features/editor/{chord-editor,text-editor,visual-editor,chord-palette}.tsx`. Состояние — `SongDoc`.

- Переключатель «Текст | Визуальный» (ToggleGroup). Текст → визуальный: `fromChordsOverLyrics`;
  при error-диагностиках показать строку и не переключать.
- Текстовый: моноширинный `<textarea>`, подсветка ошибок списком под полем. Вставка (`onPaste`), если
  текст похож на Obsidian (`#…` заголовок, ```` ```chords ````, `Бой:`), → `importObsidian`, заполнить
  форму целиком.
- Визуальный: строки, каждая буква — кнопка; тап → `chord-palette` (Popover: аккорды песни, поле
  ввода с `parseChord`, кнопки `|`, `@A…`, `×N`, удалить). Чип аккорда над буквой; перетаскивание
  pointer-событиями по буквам строки; добавление/удаление строк и разделов; ритм раздела — Select в
  заголовке.

### Task 16: web — ритм

`features/rhythm/{rhythm-list,rhythm-editor-sheet,rhythm-strip,use-strum-player}.tsx`.

- Список паттернов формы (ключ, название, `rhythm-strip`, ▶, ✎, удалить), «+ Паттерн» → выбор пресета
  или пустой.
- Редактор (Sheet снизу): название, вид, размер, число шагов, сетка клеток: для боя тап — цикл
  `↓ ↑ ⇣ ⇡ x ·`, двойной тап — акцент; для перебора — матрица 6 струн + `Б`/`Б'` × шаги. ▶ по кругу
  на выбранном аккорде (Select из аккордов песни, по умолчанию Am) с BPM.
- `rhythm-strip`: компактное отображение (стрелки или мини-таб), используется в списке, у заголовков
  разделов и в бейджах `@X` (цвет по ключу).
- ▶ у раздела: `timeline` → фильтр по разделу → `scheduleNotes` → `createStrumPlayer().play`,
  подсветка текущего аккорда через `onTick`.

### Task 17: web — список и страница песни

- `songs/page.tsx`: поиск (`search.query`, debounce) + последние (`songs.list`), кнопка «Добавить».
- `features/song/song-view.tsx`: read-only рендер (раздел, бейджи ритма, аккорды над текстом, табы,
  ▶ у разделов, capo/BPM, заметки).
- `songs/[artist]/[song]/page.tsx` — SSR для web (для capacitor-сборки исключить: в export-режиме без
  `generateStaticParams` сборка упадёт — проверь в доках Next 16, как это делается; допустимо
  `generateStaticParams` возвращать `[]` + `dynamicParams` только для web).
- `song/page.tsx` — клиентская страница по `?id=` (для Capacitor). Ссылки в списке ведут на
  `/songs/…` на вебе и `/song?id=` при `NEXT_PUBLIC_BUILD_TARGET === 'capacitor'`.

### Task 18: проверка

- `bun test` (все пакеты), `bun run check-types`, `bun run lint`.
- `cd apps/web && bun run build` и `bun run build:cap`.
- Попросить пользователя: `bun run db:up`, `cd apps/api && bun run db:migrate && bun run db:seed`,
  `bun run dev`, открыть `http://localhost:3000/ru/songs`, войти как `demo@chordtune.local`.
- Обновить раздел «Статус» в `docs/plans/2026-09-26-chordtune-design.md`.
