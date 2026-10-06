# Artists design

## Goal

Artists get a photo and a short description, and a page of their own: the profile at the top and
their best songs on ChordTune below, each leading to the song. When adding a song, the author finds
the artist among ours or picks one from Deezer, which brings the photo along; an artist found
nowhere is still created by name in one click.

## Decisions

- Sources: Deezer for identity and the photo, Wikipedia (ru and en) for the description. Both are
  free and need no keys. Last.fm has no photos since 2019, Spotify needs keys and closed new apps,
  MusicBrainz was not reliably reachable.
- Profile data is fetched once, when an artist is created or relinked, and kept in Postgres. Pages
  never call Deezer or Wikipedia; only the photo is loaded from Deezer's CDN. There is no periodic
  refresh.
- Photos are not copied to our server: we have no file storage, and Deezer image URLs are stable.
- A wrong link is fixed by an admin only. Admins are listed by email in `ADMIN_EMAILS`.
- Artists are not merged: relinking to a Deezer artist that another of ours already has is refused.

## Data

New nullable columns on `artist`, all empty for an artist created by name only:

- `deezer_id` (integer, unique): the Deezer artist; duplicates are matched on it;
- `picture_url`: Deezer's 1000×1000 picture (`picture_xl`), for the artist page;
- `picture_small_url`: Deezer's 250×250 picture (`picture_medium`), for lists;
- `wikidata_id`: the Wikidata entity the articles come from;
- `wiki` (jsonb): `{ ru?: WikiSummary, en?: WikiSummary }` with
  `WikiSummary = { title, description, extract }` from Wikipedia's `page/summary`; `title` builds
  the article link;
- `enriched_at`: when the Wikipedia data was last fetched, `null` if never.

One Drizzle migration adds them.

## Sources

`apps/api/src/services/artist-sources.ts` talks to the outside world. Parsing is kept in pure
functions tested on recorded responses; requests go through an injected `fetch` with a
`ChordTune (<BETTER_AUTH_URL>)` User-Agent, which Wikimedia requires, and a timeout.

- `searchDeezer(q)`: `api.deezer.com/search/artist`, up to 5 candidates
  `{ deezerId, name, pictureSmallUrl, fans }`. Results are cached in memory for 10 minutes per
  query, since Deezer allows 50 requests per 5 s per IP and every user's typing goes through our
  one server.
- `getDeezerArtist(id)`: `api.deezer.com/artist/<id>`: `{ deezerId, name, pictureUrl,
  pictureSmallUrl }`, or `null` when Deezer has no such artist.
- `findWikidata({ deezerId, name })`: the entity with the statement "Deezer artist ID" (P2722) equal
  to `deezerId`; failing that, the first `wbsearchentities` result whose label equals `name`
  case-insensitively and that has a "MusicBrainz artist ID" (P434), which only musicians have, so
  an album or a cartoon rat with the same name is skipped. `null` when neither matches.
- `searchWikidata(q)`: candidates `{ wikidataId, label, description }` for the admin dialog.
- `getWiki(wikidataId)`: the entity's `ruwiki` and `enwiki` sitelinks, each fetched with
  `page/summary`, into the `wiki` shape. A missing language is left out.

The tRPC context gets `artistSources`, like `search`, so tests pass a fake.

## Creating an artist

The artist input of `saveArrangement` gains a third form:

```ts
artist: { id: string } | { name: string } | { deezerId: number; name: string }
```

For `{ deezerId, name }`:

1. Before the transaction, the server fetches `getDeezerArtist(deezerId)`; nothing the client says
   about the name or the photo is trusted. If Deezer fails or does not know the id, the input is
   treated as `{ name }`, so the song is saved either way.
2. In the transaction: an artist with this `deezer_id` is reused; otherwise an artist with the same
   name (case-insensitive) and no `deezer_id` gets the Deezer fields; otherwise a new artist is
   created with Deezer's name and the pictures.
3. After commit, next to the search sync, `enrichArtist` runs in the background for an artist
   whose `enriched_at` is `null`: `findWikidata`, then `getWiki`, then it stores `wikidata_id`,
   `wiki` and `enriched_at` and re-syncs the artist's search documents. Failures are logged and
   left; the page simply has no description.

## Editor

`ArtistField` keeps its free-text input; its suggestions come in three runs, in this order:

1. our artists, as today, with the small picture (or the initials cover) and the song count;
2. `artists.searchDeezer({ q })` candidates, labelled "Deezer" with picture and fan count, from two
   typed characters, debounced, without the Deezer ids we already have;
3. "New artist «X» without a photo".

Picking a Deezer candidate fills the input with its name and remembers its id; editing the text
afterwards drops it. The form sends `{ deezerId, name }` for a remembered pick and `{ name }`
otherwise. When Deezer search fails, its group is just absent.

## Artist page

- Web: `/artists/[slug]` as `page.web.tsx`, server-rendered, titled with the artist's name.
- Capacitor: `/artist?slug=…`, rendered on the client like `/song?id=…`.
- `artistHref()` next to `songHref()` picks one. `/songs/[artist]` is not used because
  `/songs/new` would shadow an artist slugged `new`.
- Unknown slug: `notFound()` on the web, an empty state in the app.

`artists.bySlug({ slug, locale })` returns:

- `name`, `pictureUrl`, `songCount`;
- `wiki`: the summary in `locale`, falling back to the other language, with its `lang` so the
  article link points at the right Wikipedia; `null` when there is none;
- `top`: up to 50 songs that have a published arrangement, ordered by the sum of `view_count` over
  their published arrangements, then by the sum of `like_count`. Each is an
  `ArrangementListItem` of the song's latest published arrangement (the one the song's page shows)
  carrying the summed counters, so the list reuses `SongCard`.

Layout: a large round photo, or the initials cover; the name, Wikipedia's one-line description and
the song count; the extract clamped to four lines with "More"; a small "Source: Wikipedia ·
CC BY-SA" link to the article; then the songs.

Ways in:

- the artist name under a song's title links to the artist;
- searching on the songs page shows a row of matching artists (round photos) above the songs, from
  the existing Meilisearch artist index;
- `SongCard` shows the artist's small picture instead of the initials when there is one, so
  `ArtistDoc` gets `pictureSmallUrl`, `ArrangementDoc` gets `artistPictureSmallUrl` and
  `ArrangementListItem` gets `artistPictureSmallUrl`.

## Admin relink

- `ADMIN_EMAILS` (comma-separated, empty by default) in the API env, `deploy/compose.yml` and
  `deploy/.env.example`.
- `adminProcedure` refuses with `FORBIDDEN` unless the session's email is listed.
- `artists.canEdit` (public, `false` without a session) tells the client whether to show the
  button, since the server-rendered web page has no user session.
- "Change link" on the artist page opens a dialog with two pickers: Deezer candidates or "No photo",
  and Wikidata candidates (label and description) or "No article".
- `artists.relink({ id, deezerId: number | null, wikidataId: string | null })` fetches both sources
  right away, stores the result with `enriched_at`, and re-syncs the artist's search documents. The
  name and slug stay, so links keep working. A `deezerId` linked to another artist is refused with
  `CONFLICT` naming that artist.

## Existing artists

`apps/api/src/scripts/link-artists.ts`, run on the server like `reindex`: for every artist without
`deezer_id`, it searches Deezer and takes the candidate whose name equals ours case-insensitively,
the one with the most fans if several do; then it enriches the artist and finally re-indexes
search. It waits between requests to stay under Deezer's and Wikimedia's limits. Misses are left
for an admin.

## Errors

- Deezer down while typing: no Deezer group; creating by name works.
- Deezer down while saving: the artist is created by name.
- Wikidata or Wikipedia down: no description; an admin relink fetches again.
- The page does not depend on any outside service except the photo, which falls back to the
  initials cover when it fails to load.

## Testing

- `artist-sources`: parsing of recorded Deezer, Wikidata and Wikipedia responses; the P2722 lookup
  and the P434 fallback; the search cache. No network.
- `save-arrangement`, on the test Postgres with fake sources: creating by `deezerId`; the same
  `deezerId` again gives the same artist; linking an existing artist with the same name; falling
  back to the name when Deezer fails; enrichment fills `wiki`.
- `artists.bySlug`: ordering of the top songs, drafts left out, the language fallback.
- `relink`: `FORBIDDEN` for a non-admin, `CONFLICT` for a taken `deezerId`.
- `link-artists`: candidate choice (exact name, most fans).
- Web: `artistHref` for both builds. The UI is checked by hand.

## Release

Minor, v0.2.0. Only JS changes, so installed apps take it as a live update. After the deploy:
`link-artists` once on the server.
