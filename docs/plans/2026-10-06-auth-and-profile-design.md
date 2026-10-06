# Вход без пароля и профиль — дизайн

Дата: 2026-10-06. Заменяет вход по паролю на соцсети, passkeys и код на почту, добавляет
публичный профиль с ником и экран безопасности. Всё выходит одним релизом.

## Цель

Войти можно через Яндекс, VK, Google, Telegram, passkey или по коду из письма — в вебе и
в приложениях iOS/Android. Пароля нет. У каждого пользователя есть ник и публичный профиль
с разборами и счётчиками; в профиле — редактирование и «Безопасность»: сессии, passkeys,
привязанные сервисы, удаление аккаунта.

Не входит в релиз: Apple (понадобится перед App Store, guideline 4.8), загрузка своей
аватарки, bio, ачивки, вход по паролю.

## 1. Сервер (`apps/api`)

**Better Auth** (`src/auth.ts`):

- `emailAndPassword` выключен. Старые строки `account` с `provider_id = 'credential'`
  остаются в базе и не используются.
- `emailOTP`: 6 цифр, живёт 5 минут, 3 попытки. Неизвестный email — новый пользователь
  (`emailVerified = true`). Существующие пользователи с паролем входят кодом на ту же почту,
  миграция не нужна.
- Google и VK — `socialProviders`, Яндекс — `genericOAuth` с пресетом `yandex`. Провайдер
  включается, только если в env заданы его ключи.
- `accountLinking`: включено, `trustedProviders: ['google', 'yandex']` — они подтверждают
  email, вход ими склеивается с аккаунтом той же почты. VK и Telegram не склеиваются
  автоматически, только привязка из «Безопасности».
- `oneTimeToken`: обмен между системным браузером и приложением (раздел 3).
- `passkey` (`@better-auth/passkey`): RP ID — хост `BETTER_AUTH_URL`; origins — веб-домен
  и `android:apk-key-hash:<hash>` для приложения Android.
- `username` (раздел 5).
- `bearer` — как сейчас.
- Свой плагин `telegram` (`src/auth/telegram.ts`): эндпоинты `POST /api/auth/telegram`
  (вход) и `POST /api/auth/telegram/link` (привязка). Проверка: HMAC-SHA256 полей виджета
  ключом `SHA256(TELEGRAM_BOT_TOKEN)`, `auth_date` не старше 10 минут. Аккаунт —
  `provider_id = 'telegram'`, `account_id` — id пользователя Telegram.

**Пользователи без email.** В Better Auth `user.email` обязателен и уникален. Telegram email
не отдаёт, VK — не всегда. Таким пользователям ставится `tg-<id>@users.invalid` или
`vk-<id>@users.invalid`, `emailVerified = false`. Интерфейс такие адреса не показывает
(`isPlaceholderEmail` в общем модуле), письма на них не отправляются.

**Тестовый аккаунт модерации.** `REVIEW_EMAIL` + `REVIEW_CODE`: для этого email письмо не
отправляется, принимается только заданный код. Без обеих переменных механизм выключен.

**Почта** (`src/mail/`): nodemailer по `SMTP_URL`, отправитель `MAIL_FROM`. Письмо — только
код, тема и текст на языке интерфейса (локаль приходит с запросом). Без `SMTP_URL` код
печатается в лог API — для локальной разработки. Ошибка SMTP возвращается клиенту как
отдельный код ошибки.

**Список способов входа.** tRPC `auth.methods` →
`{ email: boolean, passkey: boolean, providers: ('yandex' | 'vk' | 'telegram' | 'google')[], telegramBot?: string }`.
Статическая мобильная сборка не знает env сервера, поэтому кнопки строятся по этому ответу.

**Новые переменные окружения** (все необязательные; без `SMTP_URL` в проде нет входа по коду):

```
SMTP_URL=smtps://user:pass@smtp.example.com:465
MAIL_FROM="ChordTune <no-reply@example.com>"
GOOGLE_CLIENT_ID=  GOOGLE_CLIENT_SECRET=
YANDEX_CLIENT_ID=  YANDEX_CLIENT_SECRET=
VK_CLIENT_ID=      VK_CLIENT_SECRET=
TELEGRAM_BOT_TOKEN=  TELEGRAM_BOT_NAME=
REVIEW_EMAIL=  REVIEW_CODE=
APPLE_TEAM_ID=  ANDROID_CERT_SHA256=
```

SMTP-провайдер не зашит: Unisender Go, Resend, Brevo, SES — любой с SMTP. Домен отправителя
нужен с SPF, DKIM и DMARC.

## 2. Экран входа в вебе

`features/auth/auth-sheet.tsx` переписывается; вкладок «Вход / Регистрация», имени и
пароля больше нет. Сверху вниз:

1. Кнопки провайдеров: Яндекс, VK, Telegram, Google — только включённые.
2. «Войти с passkey». Поле email с `autocomplete="email webauthn"` — браузер сам предлагает
   passkey (conditional UI).
3. «или по почте»: email → «Получить код».
4. Шаг кода: одно поле на 6 цифр, `autocomplete="one-time-code"`, отправка на шестой цифре,
   «Отправить ещё раз» через 60 секунд, «Изменить почту».

**OAuth.** Редирект `signIn.social` (Яндекс тоже: в Better Auth 1.7 genericOAuth-провайдеры идут через него) с `callbackURL` на текущую страницу.
Веб ходит в API через свой домен (rewrites Next), после возврата сессия поднимается по
cookie, а bearer-плагин отдаёт токен в `set-auth-token` — `lib/auth-client.ts` его уже
сохраняет. Черновик новой песни в `localStorage` переживает редирект.

**Telegram.** Скрипт виджета, вызов `Telegram.Login.auth({ bot_id }, cb)`
со своей кнопки, данные — на `POST /api/auth/telegram`. Домен сайта задаётся боту через
`/setdomain` в BotFather.

**Ошибки.** `?error=` после OAuth → шторка открывается снова с текстом. Отдельные тексты:
неверный код, код истёк, слишком много попыток, письмо не отправилось (с предложением войти
иначе), провайдер отказал.

**Предложение passkey.** После входа без passkey, если браузер поддерживает passkeys —
одна плашка «Входить по Face ID / отпечатку?». Закрыли — больше не показывается
(`localStorage`).

Тексты — в `messages/ru.json` и `messages/en.json`; ключи про пароль и регистрацию удаляются.

## 3. Приложения (Capacitor)

**Вход через провайдера:**

1. Приложение создаёт случайный `state`, кладёт в `sessionStorage`, открывает через
   `@capacitor/browser` `https://<домен>/<locale>/auth/mobile?provider=<p>&state=<s>`.
2. Страница (только в веб-сборке, `page.web.tsx`) запускает OAuth с `callbackURL` на
   `/<locale>/auth/mobile/done?state=<s>`.
3. `done` вызывает `oneTimeToken.generate` и делает редирект на
   `app.chordtune://auth?token=<t>&state=<s>`.
4. Приложение ловит ссылку (`@capacitor/app`, `appUrlOpen`), сверяет `state`, вызывает
   `oneTimeToken.verify`, сохраняет bearer-токен в `authToken`, закрывает браузер
   (`Browser.close()`), обновляет сессию.
5. Браузер закрыли без входа — шторка остаётся как была.

Telegram на мобильной странице — виджет в режиме редиректа (`return_to` на `done`), без
попапа. Код на почту в приложении работает в WebView напрямую, без браузера.

**Привязка сервиса из приложения.** Приложение по своему bearer-токену получает одноразовый
токен, открывает `/auth/mobile?mode=link&provider=<p>&ott=<t>&state=<s>`; страница меняет
токен на сессию в браузере, запускает `linkSocial` / привязку Telegram,
после колбэка — `app.chordtune://auth?linked=<p>&state=<s>`.

Разбор deep link и проверка `state` — чистая функция в `features/auth/mobile-link.ts`.

**Нативный слой.** Плагины `@capacitor/browser`, `@capacitor/app`; схема `app.chordtune`
в `Info.plist` (`CFBundleURLTypes`) и `intent-filter` в `AndroidManifest.xml`. Отпечаток
нативного слоя меняется — старые APK не получат этот бандл live update, нужна установка
нового APK.

**Passkeys.** В WebView (`https://localhost`) `navigator.credentials` не подходит: passkey
привязан к домену. Нативный плагин — `ASAuthorizationPlatformPublicKeyCredentialProvider`
на iOS и Credential Manager на Android — получает опции от Better Auth
(`generate-register-options` / `generate-authenticate-options`), показывает системное окно
и отдаёт ответ на `verify-registration` / `verify-authentication`. Сначала проверяется
готовый поддерживаемый плагин под Capacitor 8; нет подходящего — свой, по методу на
регистрацию и вход.

Связь домена и приложения отдаёт Next из env:

- `/.well-known/apple-app-site-association` — `webcredentials` с `APPLE_TEAM_ID.app.chordtune`;
  в приложении entitlement `webcredentials:<домен>`. Требует платный Apple Developer
  аккаунт: без него iOS-часть passkeys готова в коде, но выключена.
- `/.well-known/assetlinks.json` — `delegate_permission/common.get_login_creds` с
  `ANDROID_CERT_SHA256`.

Без `APPLE_TEAM_ID` / `ANDROID_CERT_SHA256` кнопка passkey в соответствующем приложении
не показывается.

## 4. Привязка способов входа

**Способ входа** — привязанный провайдер, passkey или подтверждённая настоящая почта.
Последний способ нельзя отвязать или удалить: Better Auth сам защищает только аккаунты
провайдеров, поэтому проверка есть и в UI, и на сервере (хук `before` на unlink, удаление
passkey и смену почты).

**«Добавить почту»** — для пользователей со служебным адресом: ввести email, подтвердить
кодом (`emailOTP`, тип `email-verification` + смена email). Если почта уже занята другим
аккаунтом — ошибка «эта почта привязана к другому аккаунту», без склейки.

## 5. Профиль

**Ник.** Плагин `username`: в `user` появляются уникальные `username` и `display_username`.

- 3–30 символов, `[a-z0-9_]`, хранится в нижнем регистре.
- Зарезервированы: `admin`, `api`, `auth`, `profile`, `settings`, `support`, `chordtune`,
  `u`, `new`, `edit`, `security` и подобные.
- Генерация при создании пользователя (хук `databaseHooks.user.create.before`): ник у
  провайдера (Telegram username, Яндекс login) → часть email до `@` (кроме служебных) →
  `user`. Транслит кириллицы через `lib/translit.ts`, лишние символы убираются, обрезка до
  30. Коллизия — суффикс `2`, `3`, … Слишком короткий результат дополняется цифрами.
- Существующим пользователям ник ставит миграция по тем же правилам.

**Страницы:**

- `/<locale>/profile` — мой профиль; без входа открывает шторку входа.
- `/<locale>/u/<ник>` — чужой профиль, SSR в веб-сборке (`page.web.tsx`) с OpenGraph.
  В статической сборке — `/<locale>/u?name=<ник>`.
- Имя автора на странице песни становится ссылкой на профиль. Пустой автор — «Аноним» без
  ссылки.

**Содержимое:** аватарка (`user.image` из провайдера, иначе буква), имя, `@ник`, дата
регистрации; счётчики — опубликованные разборы, полученные лайки на все разборы, сколько раз
разборы сохранили в библиотеку; список разборов, новые сверху. В своём профиле — и черновики
с пометкой. tRPC: `profile.byUsername`, `profile.me`, `profile.arrangements` (с курсором).

**Редактирование** (`/<locale>/profile/edit`): имя на сайте, ник с проверкой занятости
(`isUsernameAvailable`).

**Безопасность** (`/<locale>/profile/security`):

- Сессии: `listSessions`, `revokeSession`, `revokeOtherSessions`. Устройство и браузер из
  user-agent (`features/profile/user-agent.ts`), IP, последняя активность; текущая —
  «это устройство».
- Passkeys: список (название, дата), добавить, удалить.
- Сервисы: Яндекс / VK / Telegram / Google — привязать / отвязать.
- Почта: показать или «Добавить почту».
- Удаление аккаунта (`deleteUser`) с подтверждением кодом на почту, а при её отсутствии —
  свежим входом (`freshAge`).

**Удаление и разборы.** `arrangement.author_id` становится nullable с `on delete set null`;
опубликованные разборы остаются, автор — «Аноним». Лайки, сохранения, просмотры и сессии
пользователя удаляются каскадом, как сейчас.

## 6. Тесты, деплой, ключи

**Тесты** (`bun test`, PGlite из `src/test/db.ts`):

- Telegram: верная подпись, подделанная, просроченный `auth_date`.
- Код на почту: новый пользователь, существующий (бывший парольный), лимит попыток,
  тестовый аккаунт модерации.
- Склейка: Google и Яндекс склеиваются по почте, VK и Telegram — нет.
- Ник: транслит, коллизии, зарезервированные, служебные email.
- Последний способ входа не удаляется.
- Удаление аккаунта: разборы остаются с пустым автором.
- Счётчики профиля.
- Веб: разбор user-agent, разбор deep link и проверка `state`.

Интерфейс проверяет владелец проекта вручную.

**Деплой.** Новые переменные в `.env.example` и `deploy/.env.example` с комментариями.
`release.yml` передаёт `ANDROID_CERT_SHA256` (вычисляется из keystore в секретах).
Раздел «Авторизация» в README:

- колбэки: `https://<домен>/api/auth/callback/google`, `…/callback/vk`,
  `…/callback/yandex`;
- Яндекс — oauth.yandex.ru, доступ к email и аватару;
- VK — id.vk.com, веб-приложение, доверенный redirect URL;
- Google — Cloud Console → OAuth consent screen → Credentials → Web client;
- Telegram — @BotFather, создать бота, `/setdomain`;
- почта — SMTP-провайдер, SPF, DKIM, DMARC.

## Риски

- **VK и email.** Подтверждена ли почта из VK ID и всегда ли она приходит — проверить на
  живом приложении; до проверки VK не в `trustedProviders`.
- **Telegram в Custom Tabs / Safari View Controller.** Режим редиректа виджета должен
  работать без попапов — проверить на устройствах.
- **Passkeys в приложениях.** Самая рискованная часть: нативный плагин, entitlement,
  `assetlinks.json`, origin `android:apk-key-hash`. Не блокирует остальное — без настроек
  кнопка просто не показывается.
- **`oneTimeToken.verify` и bearer.** Проверить, что ответ отдаёт `set-auth-token`; иначе
  брать токен сессии из тела ответа.
- **Доставка писем** в Mail.ru и Яндекс зависит от SMTP-провайдера и DNS домена.
