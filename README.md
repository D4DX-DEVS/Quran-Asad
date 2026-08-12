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

The migration reads three source files from `data/`, all gitignored (~75 MB):

| `data/` file | Was |
|---|---|
| `quran_asad_combined_nw.sqlite` | the app's bundled content database |
| `mushaf.db` | the app's `assets/db/DB.db` |
| `quran_tajweed_complete.json` | the app's bundled Tajweed markup |

The app no longer ships any of them — they were deleted once this API took over,
so restore them from its git history rather than copying from `assets/`:

```bash
app=../message_of_quran
rev=$(git -C $app rev-list -1 HEAD -- assets/db/DB.db)
git -C $app show $rev:assets/db/quran_asad_combined_nw.sqlite > data/quran_asad_combined_nw.sqlite
git -C $app show $rev:assets/db/DB.db > data/mushaf.db
git -C $app show $rev:assets/db/quran_tajweed_data/output/quran_tajweed_complete.json \
  > data/quran_tajweed_complete.json
```

Then load them into the database named in `MONGODB_URI`:

```bash
npm run migrate
```

This drops and rebuilds 26 collections (~128k documents) and creates their
indexes, so it is safe to re-run. A missing tajweed JSON is skipped rather than
fatal. Point `DATA_DIR` at another directory to read the sources from elsewhere.

The searches match whole words against padded, punctuation-stripped, lowercased
columns — `search_text`, `search_arabic`, `search_content` — that the migration
precomputes and the API hides from responses. `src/search-text.js` holds the
normalisation both sides share; changing it means re-running the migration.

Once the data is loaded the server never touches sqlite again, so deployments do
not need the `data/` directory at all.

`npm run schema` prints every sqlite table with its columns and row count.

### Images on DigitalOcean Spaces

Large photos are served from the CDN instead of being bundled in the app. To
publish more:

```bash
node scripts/upload-images.js path/to/image.png path/to/folder
```

Files land at `<DO_SPACES_FOLDER>/images/<basename>`, public and immutably
cached, and the command prints the CDN URL to reference from
`ApiConstants.imageCdnBaseUrl`. It needs `DO_SPACES_KEY`, `DO_SPACES_SECRET`,
`DO_SPACES_ENDPOINT` and `DO_SPACES_BUCKET`; only image files are uploaded, so
pointing it at a directory will not sweep up fonts or data.

Splash screens and logos must stay bundled — they are drawn before any network
request exists — and each photo keeps a small bundled thumbnail so a blurred
preview shows while the CDN copy loads, and offline.

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
`/mushaf/ayas/:continuousAyaId/info`, `/mushaf/font-zips`.

`/mushaf/juzs/:juz/name` always returns `{name: ""}`: the `t_juznames` table was
missing from the shipped mushaf database, which is why the app already falls
back to an empty name.

`/mushaf/font-zips` lists the mushaf font packs still to download. Serving it
here is what let the app drop the 15.4 MB `DB.db` asset, which existed only for
that one query.

### Tajweed

`/tajweed/words?surah=&verseFrom=&verseTo=`, `/tajweed/html?surah=` and
`/tajweed/image-urls?limit=&offset=`.

`/tajweed/html` returns the colour-coded Tajweed markup for one surah. It used
to be a 5.5 MB JSON bundled in the app; the app now fetches the surah it is
showing.

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
  migrate-to-mongo.js  one-off sqlite/json → mongo load
  upload-images.js     uploads app images to DigitalOcean Spaces
  dump-schema.js       prints sqlite table/column/row-count listing
data/                  migration sources, gitignored
```
