# Дизайн-система, соцдействия, дзен-режим, офлайн, редактор — план

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Живой красивый интерфейс в двух темах, лайки/сохранения/просмотры/«Сыграл», дзен-режим с
автопрокруткой в темпе, офлайн-библиотека в приложении и редактор «песня в центре».

**Architecture:** Счётчики — таблицы действий + денормализованные колонки в `arrangement`,
меняются в одной транзакции. Web: семантические CSS-токены + `next-themes`, анимации на `motion`,
офлайн — IndexedDB (`idb`) с очередью «Сыграл». Дзен-прокрутка — чистая функция поверх
`timeline`/`eventSeconds`.

**Tech Stack:** Bun 1.4, Drizzle 1.0 RC + PGlite в тестах, tRPC 11, Next.js 16, Base UI + shadcn,
Tailwind v4, `motion` 13, `next-themes`, `idb`, `fake-indexeddb`, `@capacitor/haptics`,
`@capacitor/network`.

**Spec:** `docs/superpowers/specs/2026-09-27-ui-social-offline-design.md`

## Global Constraints

- Числа — не больше 3 значащих символов: `999`, `1.2K`, `12K`, `2.5M`, округление вниз.
- Иконки — только `lucide-react`, никаких эмодзи в UI.
- Аккорды на карточках списка не показываются; `chords` уходят из элементов списка API.
- Просмотр засчитывается не чаще раза в сутки на `viewer_key`.
- Офлайн гарантирован только в Capacitor; веб без service worker.
- Токены: компоненты используют только CSS-переменные тем, не сырые цвета.
- `prefers-reduced-motion` — только затухания.
- Все строки UI через next-intl (ru/en).
- Коммит после каждой задачи, сообщения на английском, трейлер `Co-Authored-By`.
- UI проверяет пользователь; агент проверяет только отсутствие ошибок в консоли.

## Review Focus

- Быстрые двойные тапы по лайку/сохранению → счётчик не уходит в минус и не расходится с сервером
  (идемпотентность в API + блок кнопки на время запроса). Тест в Task 2.
- Песня без аккордов (только текст) в дзен-режиме → «Сыграть» недоступна, а не падает. Тест в Task 9.
- Песня без BPM и без ритмов → дзен и «Послушать» идут в 90 BPM 4/4. Тест в Task 9.
- Одна и та же песня «Сыграл» трижды офлайн → один запрос `played({times:3})`. Тест в Task 10.
- Удалённый с сервера сохранённый разбор → `NOT_FOUND` при обновлении не стирает локальную копию
  до сверки с `library.saved()`, а сверка удаляет. Тест в Task 10.

---

## Этап 1. API

### Task 1: таблицы действий и счётчики

**Files:**
- Modify: `apps/api/src/db/schema.ts`
- Create: миграция `apps/api/drizzle/<ts>_*/migration.sql` (генерируется)

**Produces:** таблицы `arrangementView`, `arrangementLike`, `arrangementSave`, `arrangementPlay`;
колонки `arrangement.viewCount/likeCount/saveCount`.

- [ ] **Step 1:** В `schema.ts` добавить в `arrangement`:

```ts
viewCount: integer('view_count').notNull().default(0),
likeCount: integer('like_count').notNull().default(0),
saveCount: integer('save_count').notNull().default(0),
```

и таблицы:

```ts
export const arrangementView = pgTable(
  'arrangement_view',
  {
    arrangementId: text('arrangement_id').notNull().references(() => arrangement.id, { onDelete: 'cascade' }),
    viewerKey: text('viewer_key').notNull(),
    day: date('day').notNull(),
  },
  (t) => [primaryKey({ columns: [t.arrangementId, t.viewerKey, t.day] })],
);

const userAction = (name: string) =>
  pgTable(
    name,
    {
      userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
      arrangementId: text('arrangement_id').notNull().references(() => arrangement.id, { onDelete: 'cascade' }),
      createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (t) => [primaryKey({ columns: [t.userId, t.arrangementId] })],
  );
export const arrangementLike = userAction('arrangement_like');
export const arrangementSave = userAction('arrangement_save');

export const arrangementPlay = pgTable(
  'arrangement_play',
  {
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    arrangementId: text('arrangement_id').notNull().references(() => arrangement.id, { onDelete: 'cascade' }),
    count: integer('count').notNull().default(0),
    lastPlayedAt: timestamp('last_played_at').defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.arrangementId] })],
);
```

Добавить их в `defineRelations({...})` (без связей — только чтобы были в схеме RQB).
- [ ] **Step 2:** `cd apps/api && bun run db:generate && bun run check-types` — миграция создана,
  типы чисты. Проверить SQL глазами (PK, FK cascade, defaults).
- [ ] **Step 3:** `bun test` — прежние тесты зелёные (миграции применяются в PGlite).
- [ ] **Step 4:** Коммит `Add like, save, view and play tables with counters`.

### Task 2: сервис соцдействий и процедуры

**Files:**
- Create: `apps/api/src/services/social.ts`, `apps/api/src/services/social.test.ts`
- Create: `apps/api/src/trpc/routers/library.ts`
- Modify: `apps/api/src/trpc/routers/arrangements.ts`, `apps/api/src/trpc/router.ts`

**Interfaces — Produces:**

```ts
recordView(db, arrangementId: string, viewerKey: string, day?: string): Promise<{ views: number }>
setLike(db, userId, arrangementId, liked: boolean): Promise<{ likes: number; liked: boolean }>
setSave(db, userId, arrangementId, saved: boolean): Promise<{ saves: number; saved: boolean }>
addPlays(db, userId, arrangementId, times: number): Promise<{ played: number }>
viewerState(db, userId: string | null, arrangementId): Promise<{ liked: boolean; saved: boolean; played: number } | null>
```

Процедуры: `arrangements.view({ id, viewerKey })` (public; вошедшему `viewerKey = user.id`),
`like/unlike/save/unsave({ id })`, `played({ id, times: 1..50 })` — protected.

- [ ] **Step 1: тесты** (`social.test.ts`, PGlite через `createTestDb`, разбор создаётся через
  `saveArrangement`):
  - `recordView` дважды в один день → `views` 1; на другой день (`day` параметр) → 2;
  - `setLike(true)` дважды → `likes` 1; второй пользователь → 2; `setLike(false)` → 1; снова
    `false` → 1 (не в минус);
  - `setSave` — то же;
  - `addPlays(…, 3)` → 3, затем `addPlays(…, 1)` → 4;
  - `viewerState(null)` → `null`; после лайка → `{ liked: true, saved: false, played: 0 }`;
  - несуществующий разбор → `TRPCError NOT_FOUND`.
- [ ] **Step 2:** `bun test src/services/social.test.ts` → FAIL (модуля нет).
- [ ] **Step 3: реализация.** Каждая функция — транзакция: проверить разбор (`NOT_FOUND`),
  `insert … onConflictDoNothing().returning()`; если вернулась строка — `update arrangement set
  like_count = like_count + 1` и вернуть новое значение; удаление — `delete … returning()` и
  `- 1` только при удалённой строке. `recordView`: `day` по умолчанию `new Date().toISOString().slice(0, 10)`.
  `addPlays`: `insert … onConflictDoUpdate({ target: [userId, arrangementId], set: { count: sql`${arrangementPlay.count} + ${times}`, lastPlayedAt: new Date() } })`.
- [ ] **Step 4:** Процедуры в `arrangements.ts`; zod: `id: z.string()`, `times: z.number().int().min(1).max(50).default(1)`,
  `viewerKey: z.string().min(8).max(64)`. После like/save — `scheduleSearchSync(ctx, id)` (Task 3).
- [ ] **Step 5:** `bun test && bun run check-types` → PASS. Коммит `Add view, like, save and play actions`.

### Task 3: статистика в выдаче, библиотека, поиск

**Files:**
- Modify: `apps/api/src/trpc/routers/{arrangements,songs,search,shared}.ts`, `apps/api/src/search/{index,documents}.ts`
- Create: `apps/api/src/trpc/routers/library.ts`, `apps/api/src/search/throttle.ts`
- Test: `apps/api/src/services/social.test.ts` (дополнить), `apps/api/src/search/throttle.test.ts`

**Produces:**

```ts
type ArrangementListItem = { id; artist; artistSlug; title; songSlug; views: number; likes: number };
// byId / bySlug: + stats: { views, likes, saves }, me: { liked, saved, played } | null
library.saved(): ArrangementView[]   // полные, новые сверху
library.liked(): ArrangementListItem[]
library.mine(): ArrangementListItem[]
```

- [ ] **Step 1:** `ArrangementDoc` += `views`, `likes`; `toArrangementDoc` берёт `viewCount/likeCount`;
  `listItemFromDoc` отдаёт `views/likes`, без `chords`. `songs.list` — `orderBy: { viewCount: 'desc', createdAt: 'desc' }`.
- [ ] **Step 2:** `toView` добавляет `stats` и `me` (через `viewerState`).
- [ ] **Step 3:** `throttle.ts`: `createThrottle(ms)` → `(key, fn) => void`, вызывает `fn` не чаще раза
  в `ms` на ключ (последний вызов в окне выполняется в конце окна). Тест с фейковыми таймерами
  (`setSystemTime` / маленький `ms` и `await Bun.sleep`). `scheduleSearchSync(ctx, id)` =
  `throttle(id, () => syncArrangement(ctx.db, ctx.search, id))`, окно 30 с.
- [ ] **Step 4:** `library.ts` (protected): `saved` — join `arrangement_save` → разборы с `WITH_DETAILS`,
  через тот же `toView`; `liked` — join `arrangement_like`; `mine` — `authorId = me`. Тест в
  `social.test.ts`: `saved` возвращает только свои и в порядке `createdAt desc`.
- [ ] **Step 5:** `bun test && bun run check-types`; `cd apps/web && bun run check-types` — поправить
  `songs-browser.tsx` (убрать `chords`). Коммит `Return stats and library, drop chords from lists`.

## Этап 2. Дизайн-система и оболочка

### Task 4: токены, темы, шум, motion, formatCount

**Files:**
- Modify: `apps/web/src/app/globals.css`, `apps/web/src/app/[locale]/layout.tsx`, `apps/web/src/components/providers.tsx`, `apps/web/package.json` (скрипт `test`)
- Create: `apps/web/src/lib/format.ts`, `apps/web/src/lib/format.test.ts`, `apps/web/src/lib/motion.ts`, `apps/web/src/features/rhythm/rhythm-colors.ts` (переписать на токены)

**Produces:** `formatCount(n: number): string`; `spring.soft`, `spring.pop`, `useReducedMotionSafe()`;
токены из таблицы спеки как Tailwind-цвета: `bg-surface`, `bg-surface-2`, `text-muted`,
`bg-accent`, `text-accent-foreground`, `text-chord`, `text-like`, `text-saved`, `font-display`,
`shadow-glow`.

- [ ] **Step 1: тест** `format.test.ts`: `0→'0'`, `999→'999'`, `1000→'1K'`, `1234→'1.2K'`,
  `9999→'9.9K'`, `12345→'12K'`, `999999→'999K'`, `2512000→'2.5M'`, `1000000→'1M'`.
- [ ] **Step 2:** `bun test src/lib` → FAIL; реализовать:

```ts
const trim = (value: number) => String(value).replace(/\.0$/, '');
export function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${trim(Math.floor(n / 100) / 10)}K`;
  if (n < 1_000_000) return `${Math.floor(n / 1000)}K`;
  return `${trim(Math.floor(n / 100_000) / 10)}M`;
}
```

  `bun test src/lib` → PASS. В `package.json` web: `"test": "bun test src/lib"`.
- [ ] **Step 3:** `bun add next-themes`. `globals.css`: `:root` = светлая «Песенник», `.dark` = тёмная
  «Неон тюнера» (значения из таблицы спеки); shadcn-токены (`--background`, `--card`, `--popover`,
  `--primary`, `--muted`, `--border`, `--input`, `--ring`, `--accent`) переопределить через наши;
  `@theme inline` — новые цвета; `body` — фон (в тёмной радиальный градиент `#1b2140` → `#0b0d17`),
  `body::before` — шум (`position: fixed; inset: 0; pointer-events: none; z-index: 50;
  opacity: var(--noise-opacity); mix-blend-mode: var(--noise-blend)`, SVG `feTurbulence` data-URI).
  `--rhythm-1..8` и `rhythmColor` на них.
- [ ] **Step 4:** `layout.tsx`: убрать хардкод `dark`, `suppressHydrationWarning` на `<html>`;
  `Providers` оборачивает в `ThemeProvider attribute="class" defaultTheme="system" enableSystem
  disableTransitionOnChange`. `viewport.themeColor` — массив для light/dark.
- [ ] **Step 5:** `motion.ts`: `export const spring = { soft: { type: 'spring', stiffness: 300, damping: 30 }, pop: { type: 'spring', stiffness: 500, damping: 15 } } as const;`
- [ ] **Step 6:** `bun run check-types`, `bun run lint`, открыть `/ru` и `/ru/songs` в превью: нет
  ошибок в консоли, тюнер читается в обеих темах. Коммит `Add design tokens, themes and grain`.

### Task 5: оболочка — вкладки, шапка, тема, переходы

**Files:**
- Modify: `apps/web/src/components/app-shell.tsx`, `apps/web/src/features/auth/account-button.tsx`, `apps/web/messages/{ru,en}.json`
- Create: `apps/web/src/components/theme-switcher.tsx`, `apps/web/src/app/[locale]/template.tsx`, `apps/web/src/app/[locale]/library/page.tsx` (заглушка до Task 11)

- [ ] **Step 1:** Вкладки `Тюнер (AudioLines) · Песни (ListMusic) · Моё (Bookmark)`; мобильная —
  плавающая панель (`fixed inset-x-3 bottom-3`, blur, `rounded-[22px]`), активная плашка —
  `motion.span layoutId="tab-pill"` с `spring.soft`; десктоп — вкладки в шапке с той же плашкой.
- [ ] **Step 2:** `ThemeSwitcher` — три иконки (`Monitor`, `Moon`, `Sun`) в поповере аккаунта и рядом с
  «Войти» для гостя; `useTheme()`; рендер после монтирования (без мигания).
- [ ] **Step 3:** `template.tsx` — `motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`
  (при reduced motion `y: 0`).
- [ ] **Step 4:** i18n: `app.nav.library`, `app.theme.{system,dark,light}`. Проверка в превью,
  коммит `Redesign app shell with animated tabs and theme switcher`.

## Этап 3. «Песни»

### Task 6: страница «Песни»

**Files:**
- Modify: `apps/web/src/features/songs/songs-browser.tsx`, `messages`
- Create: `apps/web/src/features/songs/{song-card,create-song-menu,paste-note-sheet,cover}.tsx`, `apps/web/src/features/songs/cover.test.ts`

**Produces:** `coverColors(seed: string): [string, string]` (пара CSS-переменных из палитры по
хешу), `SongCard({ item })`, `CreateSongMenu()`.

- [ ] **Step 1: тест** `cover.test.ts`: одинаковый seed → одинаковая пара; разные исполнители дают
  не одну пару на всех (≥ 3 разных на 10 имён); `initials('Noize MC') === 'NM'`, `initials('LUMEN') === 'LU'`,
  `initials('Сектор Газа') === 'СГ'`.
- [ ] **Step 2:** реализовать `cover.ts` (FNV-хеш по строке → индекс в `COVER_PAIRS` из 6 пар
  токенов) → PASS.
- [ ] **Step 3:** `SongCard` — `Link` на `songHref`, обложка `bg-linear-135 from-[var(a)] to-[var(b)]`
  + инициалы, название, исполнитель, справа `Eye`/`Heart` + `formatCount`.
- [ ] **Step 4:** `CreateSongMenu` — плашка с `Plus`, по тапу `rotate(135deg)` и раскрытие
  (`motion` `height: auto` + каскад пунктов): «Написать» → `/songs/new`; «Вставить из заметки» →
  `PasteNoteSheet`: `Textarea`, кнопка «Вставить из буфера» (если `navigator.clipboard?.readText`),
  «Продолжить» → `importObsidian`; если `content` пустой и ритмов нет — ошибка
  `songs.pasteFailed` + кнопка «Открыть пустой редактор»; иначе `saveDraft({...})` → `router.push('/songs/new')`.
- [ ] **Step 5:** `SongsBrowser`: заголовок (`font-display`), поиск с подсветкой фокуса, меню,
  подпись «Популярное»/«Найдено · N», список `AnimatePresence` + `motion.li layout` с каскадом
  (`delay: i * 0.045`), скелетоны (3 серые карточки с `animate-pulse`), пустое состояние со ссылкой.
- [ ] **Step 6:** Превью без ошибок, коммит `Redesign songs page with create menu and animated list`.

## Этап 4. Трек и дзен

### Task 7: действия на странице трека

**Files:**
- Create: `apps/web/src/features/song/{song-actions,action-button,count-roll,sparks,toast}.tsx`, `apps/web/src/features/song/use-song-actions.ts`, `apps/web/src/lib/viewer-key.ts`, `apps/web/src/lib/haptics.ts`
- Modify: `apps/web/src/features/song/song-view.tsx`, `apps/api` не трогаем, `messages`
- Deps: `bun add @capacitor/haptics`

**Consumes:** `arrangements.view/like/unlike/save/unsave/played`, `stats`, `me` (Task 2–3).
**Produces:** `useSongActions(arrangement)` → `{ stats, me, like(), save(), played(times?) }`
(оптимистично, с откатом; без входа — `openAuth()`); `onSaved`/`onUnsaved` колбэки для офлайна
(Task 11).

- [ ] **Step 1:** `viewer-key.ts`: uuid в `localStorage['chordtune.viewer']`, создаётся лениво.
  `SongView` при монтировании один раз вызывает `view` (ref-guard от StrictMode).
- [ ] **Step 2:** `CountRoll({ value })` — `AnimatePresence` с `motion.span` сверху/снизу по
  направлению изменения, `formatCount`.
- [ ] **Step 3:** `ActionButton` + анимации: like — `animate={{ scale: [1, .6, 1.35, 1] }}` и `Sparks`
  (10 точек `--like` разлетаются на 18–32 px, 0.6 с); save — иконка «падает» (`y: [-8, 2, 0]`),
  SVG-кольцо `pathLength 0 → 1` 0.7 с, тост; played — `rotate: [0, -18, 12, 0]` и «+1» вверх.
  Кнопка `disabled` на время запроса.
- [ ] **Step 4:** Шапка трека: «назад» (`router.back()` или ссылка на `/songs`), меню ⋯:
  «Редактировать» (автору → `/songs/new?edit=<id>`), «Скопировать ссылку».
- [ ] **Step 5:** `haptics.ts`: `tap()` — `Haptics.impact({ style: ImpactStyle.Light })` в Capacitor,
  иначе ничего.
- [ ] **Step 6:** Превью: лайк без входа открывает шторку, с входом — анимация и счётчик; коммит
  `Add like, save and played actions to the song page`.

### Task 8: док «Послушать / Сыграть»

**Files:**
- Create: `apps/web/src/features/song/song-dock.tsx`
- Modify: `apps/web/src/features/rhythm/playback.ts` (добавить `songPlayback`), `song-view.tsx`

**Produces:** `songPlayback(doc, rhythms, bpm)` → `{ events, seconds, notes }` для всей песни.

- [ ] **Step 1:** `songPlayback` = `sectionPlayback` без фильтра разделов.
- [ ] **Step 2:** Док: две пилюли внизу (`fixed bottom-[calc(5.5rem+safe-area)] md:bottom-6`, над
  вкладками): «Послушать» (подпись «Бой A · 90 BPM», во время игры — название текущего раздела)
  и «Сыграть» (`bg-accent shadow-glow`, подпись «Текст поедет сам»; `disabled`, если в песне нет
  аккордов). Кнопки ▶ у разделов остаются.
- [ ] **Step 3:** Превью, коммит `Add listen and play dock to the song page`.

### Task 9: дзен-режим

**Files:**
- Create: `apps/web/src/features/zen/zen-timing.ts`, `apps/web/src/features/zen/zen-timing.test.ts`, `apps/web/src/features/zen/zen-mode.tsx`, `apps/web/src/features/zen/use-wake-lock.ts`
- Modify: `song-dock.tsx`, `package.json` (`"test": "bun test src"`), `messages`

**Produces:**

```ts
type ZenLine = { section: number; line: number; start: number; end: number; chordStarts: number[] };
zenLines(doc, rhythms, bpm): ZenLine[]            // только строки с аккордами, секунды
zenPosition(lines, t): { index: number; progress: number; chord: number; done: boolean }
zenOffset(progress): number                       // 0 до 0.7, дальше smoothstep до 1
```

- [ ] **Step 1: тесты:**
  - `${Am}a ${G}b\n${F}c` при 60 BPM 4/4 без ритмов → строки `[0,8)`, `[8,12)`;
    `chordStarts` первой `[0, 4]`;
  - `zenPosition(lines, 5)` → `{ index: 0, progress: .625, chord: 1, done: false }`;
  - `t` за концом → `{ index: last, progress: 1, done: true }`;
  - строка текста без аккордов и таб пропускаются;
  - `|${Am}|${G}|` → одна строка длиной 2 такта; повтор `${x2}` удваивает длину строки;
  - нет аккордов вообще → `zenLines` возвращает `[]`;
  - `zenOffset(.5) === 0`, `zenOffset(1) === 1`, `zenOffset(.85) === .5`.
- [ ] **Step 2:** реализовать: `timeline` + `eventSeconds`, группировка событий по `(section, line)`
  с порядком появления; `start` = min, `end` = max; `chordStarts` — старты событий. `zenPosition` —
  бинарный поиск по `start`. → PASS.
- [ ] **Step 3:** `ZenMode({ arrangement, onClose, onFinished })` — `fixed inset-0 z-[60]` слой:
  отсчёт 3-2-1 (`AnimatePresence`, 700 мс), `requestAnimationFrame`-часы с паузой и темпом
  (изменение темпа пересчитывает `zenLines` и сохраняет прогресс в тактах), список строк через
  `LineView` крупным шрифтом, `translateY` = `0.34 * h - (top_i + (top_{i+1} - top_i) * zenOffset(progress))`
  по `offsetTop` строк; текущая `opacity 1 scale 1.04`, пройденные `.14`, прочие `.3`; подсветка
  текущего аккорда (`activeItem`); верх — закрыть, название, раздел, прогресс-полоса; низ — пауза,
  4 точки долей, темп ±5 (40–220), «такт N/M». Тап по тексту — пауза. `done` → карточка «+1»,
  `onFinished()` один раз. `useWakeLock(active)`. Esc — закрыть.
- [ ] **Step 4:** `onFinished` → `played()` (онлайн) или очередь (Task 10–11 подключат).
- [ ] **Step 5:** Превью: песня едет в темпе, пауза, темп, завершение; коммит `Add zen mode with tempo-synced scrolling`.

## Этап 5. «Моё» и офлайн

### Task 10: офлайн-хранилище и очередь

**Files:**
- Create: `apps/web/src/features/library/offline-store.ts`, `apps/web/src/features/library/offline-store.test.ts`
- Deps: `bun add idb`, `bun add -d fake-indexeddb`

**Produces:**

```ts
saveOffline(arrangement: ArrangementView): Promise<void>
removeOffline(id: string): Promise<void>
getOffline(id: string): Promise<ArrangementView | null>
listOffline(): Promise<ArrangementView[]>           // новые сверху
reconcileOffline(server: ArrangementView[]): Promise<void>  // перезаписать, добавить, удалить лишние
enqueuePlayed(id: string, times?: number): Promise<void>
flushQueue(send: (id: string, times: number) => Promise<void>): Promise<void>
```

- [ ] **Step 1: тесты** (`import 'fake-indexeddb/auto'`, каждая проверка на новой БД через
  `resetOfflineStore()`): save/get/list/remove; `reconcileOffline` удаляет отсутствующие на сервере
  и обновляет изменённые; `enqueuePlayed(a)` ×3 + `enqueuePlayed(b)` → `flushQueue` вызывает
  `send(a, 3)` и `send(b, 1)`, очередь пуста; `send` бросает → очередь сохранена.
- [ ] **Step 2:** реализация на `idb` (`openDB('chordtune', 1, { upgrade })`, stores `songs`
  keyPath `id`, `queue` autoIncrement) → PASS. Коммит `Add offline song store and played queue`.

### Task 11: «Моё» и офлайн в приложении

**Files:**
- Create: `apps/web/src/features/library/{library-page,use-offline-sync}.tsx`, `apps/web/src/lib/network.ts`
- Modify: `apps/web/src/app/[locale]/library/page.tsx`, `apps/web/src/features/song/{song-by-id,use-song-actions}.ts(x)`, `zen-mode` wiring, `messages`
- Deps: `bun add @capacitor/network`

- [ ] **Step 1:** `network.ts`: `useOnline()` — `@capacitor/network` в Capacitor, иначе
  `navigator.onLine` + события.
- [ ] **Step 2:** `useOfflineSync()` (в `Providers`): при старте и переходе в онлайн —
  `flushQueue((id, times) => trpc.arrangements.played.mutate({ id, times }))`, затем для вошедшего
  `reconcileOffline(await library.saved())`.
- [ ] **Step 3:** `use-song-actions`: save → `saveOffline`, unsave → `removeOffline`; played без сети →
  `enqueuePlayed` + оптимистичный счётчик; лайк/сохранение без сети — `disabled` + подсказка.
- [ ] **Step 4:** `SongById`: сначала `getOffline(id)` → показать, затем `byId` → показать и, если
  сохранён, `saveOffline`; без сети и без копии — «Нет сети»; с копией — плашка «Офлайн».
- [ ] **Step 5:** `LibraryPage`: подвкладки «Сохранённые · Понравившиеся · Мои разборы»
  (скользящая плашка `layoutId`), сохранённые из `listOffline()` с меткой «офлайн» в Capacitor
  (в вебе — из `library.saved`), остальные — `library.liked/mine`; `SongCard`; пустые состояния с
  иконкой; без входа — приглашение войти.
- [ ] **Step 6:** `bun run build:cap` проходит; превью; коммит `Add library tab with offline saved songs`.

## Этап 6. Редактор

### Task 12: редактор «песня в центре»

**Files:**
- Create: `apps/web/src/features/editor/{editor-header,song-meta-sheet,rhythm-chips,editor-dock,save-button}.tsx`
- Modify: `apps/web/src/features/editor/{song-form,chord-editor}.tsx`, `apps/web/src/app/[locale]/songs/new/page.tsx`, `messages`

- [ ] **Step 1:** `SaveButton({ state: 'idle' | 'saving' | 'saved' })` — ширина анимируется, текст ↔
  спиннер ↔ `Check` (по мотивам uselayouts `save-button`).
- [ ] **Step 2:** `SongMetaSheet` — существующие поля (исполнитель, название, capo, BPM, тональность,
  заметки) в нижней шторке; в форме — одна карточка «Название · Исполнитель · Capo N · BPM» (пустые —
  плейсхолдер «Что за песня?»).
- [ ] **Step 3:** `RhythmChips` — горизонтальный скролл чипов `A ↓·↓↑·↑↓↑` + «＋» (поповер пресетов из
  `RhythmList`), тап — `RhythmEditorSheet`. `RhythmList` остаётся для логики, UI списка убирается.
- [ ] **Step 4:** `EditorDock` — «Визуально / Текст / Проверить» с плашкой `layoutId`; «Проверить» —
  `SongView` в режиме `preview` (без действий и просмотров, с доком «Послушать/Сыграть»).
  `ChordEditor` получает `mode` снаружи.
- [ ] **Step 5:** `?edit=<id>`: `SongForm` загружает `byId`, заполняет форму, сохраняет через
  `arrangements.update`; черновик для правки не пишется. Страница `new/page.tsx` оборачивает форму
  в `Suspense` (из-за `useSearchParams`).
- [ ] **Step 6:** Превью: создать и отредактировать песню; коммит `Redesign editor around the song`.

### Task 13: проверка

- [ ] `bun run test`, `bun run check-types`, `bun run lint` в корне.
- [ ] `cd apps/web && bun run build && bun run build:cap`.
- [ ] Обновить «Статус» в `docs/plans/2026-09-26-chordtune-design.md`.
- [ ] Команды для пользователя: `cd apps/api && bun run db:migrate && bun run search:reindex`,
  `bun run dev`.
