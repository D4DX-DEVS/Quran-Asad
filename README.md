# MOQ Backend

REST API serving the Quran content for the **Message of the Quran** Flutter app
(`../message_of_quran`). The app used to read this data straight out of a bundled
sqlite file; it now fetches it from here.

## Requirements

Node.js **22.5+** and a MongoDB database. The content lives in MongoDB; the
sqlite files it came from are only needed to run the one-off migration.

## Setup

```bash
npm install
cp .env.example .env      # set MONGODB_URI
npm start                 # or: npm run dev  (watch mode)
```

### Loading the content into MongoDB

The two sqlite files live in `data/` and are gitignored (they total ~70 MB).
Copy them from the Flutter app's assets:

```bash
cp ../message_of_quran/assets/db/quran_asad_combined_nw.sqlite data/
cp ../message_of_quran/assets/db/DB.db data/mushaf.db
```

Then load them into the database named in `MONGODB_URI`:

```bash
npm run migrate
```

This drops and rebuilds 24 collections (~121k documents) and creates their
indexes, so it is safe to re-run. Point `DATA_DIR` at another directory to read
the sqlite files from elsewhere.

The searches match whole words against padded, punctuation-stripped, lowercased
columns — `search_text`, `search_arabic`, `search_content` — that the migration
precomputes and the API hides from responses. `src/search-text.js` holds the
normalisation both sides share; changing it means re-running the migration.

Once the data is loaded the server never touches sqlite again, so deployments do
not need the `data/` directory at all.

`npm run schema` prints every sqlite table with its columns and row count.

### SRV lookups

`mongodb+srv://` URIs need a DNS SRV lookup, and some home and ISP resolvers
refuse them outright — the driver fails with `querySrv ECONNREFUSED`. Set
`DNS_SERVERS=8.8.8.8,1.1.1.1` locally to work around it; leave it unset in
production.

## Pointing the app at this API

The Flutter client reads its base URL from a compile-time define, defaulting to
`http://localhost:3000/api/v1`:

```bash
flutter run --dart-define=MOQ_API_BASE_URL=https://your-host/api/v1
```

On the Android emulator, `localhost` is the emulator itself — use
`http://10.0.2.2:3000/api/v1`.

## Health and rate limiting

`GET /health` reports `200 {"status":"ok","database":"up"}` while MongoDB
answers a ping, and `503 {"status":"degraded","database":"down"}` when it does
not — so a dropped connection surfaces there rather than as failing routes.

Every `/api/v1` route is rate limited per IP: 300 requests per 60 seconds by
default, tunable with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`. Exceeding it
returns `429 {"error":"too many requests"}`. Behind a proxy or load balancer,
set `TRUST_PROXY` to the number of hops, otherwise every request is counted as
coming from one client.

## API

Everything is `GET`, and every route is mounted under `/api/v1`. Endpoints return
**raw database rows** under their original sqlite column names, which the
migration preserved, so the Dart models parse them unchanged. A `?malayalam=true` query parameter switches an endpoint to its
Malayalam source table wherever both languages exist.

### Quran content

| Endpoint | Returns |
|---|---|
| `/surahs` | all 114 surahs |
| `/surahs/:number` | one surah |
| `/surahs/:surah/verses` | translation blocks for a surah |
| `/surahs/:surah/verses/:verse` | one translation block |
| `/surahs/:surah/arabic` | Arabic text for a surah |
| `/surahs/:surah/arabic/:verse` | Arabic text for one ayah |
| `/surahs/:surah/interpretations/:number` | a footnote / interpretation |
| `/surahs/:surah/interpretations/range` | `{min, max}` footnote numbers |
| `/surahs/:surah/footnotes/:footnote/verse-numbers` | verses citing a footnote |
| `/juzs`, `/hizbs` | navigation index |

### Search

| Endpoint | Notes |
|---|---|
| `/search/verses?q=&limit=` | whole-word match, punctuation-insensitive |
| `/search/arabic?q=&limit=` | diacritics and Alef variants normalised, so bare-letter queries match vowelled text |
| `/search/interpretations?q=&limit=` | resolves each footnote back to its verse |

### Book content

`/prefaces/:surahId`, `/appendices`, `/appendices/:number`, `/foreword`,
`/ml-preface`, `/authors`, `/about-author`, `/translator`,
`/works-of-reference`, `/contact`, `/contact/english`.

`/contact/info` and `/help` always return `[]` — their tables were not present in
the source database, so nothing was migrated for them, matching the app's
existing behaviour.

### Mushaf

Page rendering and glyph data, from the `mushaf_*` collections:
`/mushaf/pages/meta`,
`/mushaf/pages/:page/lines`, `/mushaf/pages/:page/meta`, `/mushaf/pages/ayas`,
`/mushaf/surahs/glyphs`, `/mushaf/surahs/:surah/glyph`,
`/mushaf/surahs/:surah/bismillah-glyph`, `/mushaf/bismillah-glyphs`,
`/mushaf/surahs/:surah/first-page`, `/mushaf/surahs/:surah/continuous-aya-ids`,
`/mushaf/juzs/first-pages`, `/mushaf/juzs/:juz/name`,
`/mushaf/ayas/:continuousAyaId/page`, `/mushaf/ayas/continuous-id`,
`/mushaf/ayas/:continuousAyaId/info`.

`/mushaf/juzs/:juz/name` always returns `{name: ""}`: the `t_juznames` table was
missing from the shipped mushaf database, which is why the app already falls
back to an empty name.

### Tajweed

`/tajweed/words?surah=&verseFrom=&verseTo=` and
`/tajweed/image-urls?limit=&offset=`.

There is one tajweed row per word in the Qur'an (~77k), so `/tajweed/image-urls`
is paged: `limit` defaults to and is capped at 5000, and `offset` walks the
rest. The URLs it returns point at the DigitalOcean Spaces CDN that hosts the
word images.

## What stayed in the app

Bookmarks, reading progressions, and settings remain in the app's local
`user_data.db` and `SharedPreferences`. They are per-device user data, not
shared content, so they are deliberately not served from here.

## Layout

```
src/
  server.js            express app, route mounting, error handling
  db/index.js          mongo connection and find/findOne helpers
  search-text.js       search normalisation shared with the migration
  dns.js               optional DNS_SERVERS override for SRV lookups
  utils.js             param parsing, HttpError, async route wrapper
  routes/              one module per resource group
scripts/
  migrate-to-mongo.js  one-off sqlite → mongo load
  dump-schema.js       prints sqlite table/column/row-count listing
data/                  source sqlite files, migration only (gitignored)
```
