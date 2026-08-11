# MOQ Backend

REST API serving the Quran content for the **Message of the Quran** Flutter app
(`../message_of_quran`). The app used to read this data straight out of a bundled
sqlite file; it now fetches it from here.

## Requirements

Node.js **22.5+** — the API reads sqlite through the built-in `node:sqlite`
module, so there is no native build step and no database driver to install.

## Setup

```bash
npm install
cp .env.example .env      # optional; PORT defaults to 3000
npm start                 # or: npm run dev  (watch mode)
```

### Database files

The two sqlite files live in `data/` and are gitignored (they total ~70 MB).
Copy them from the Flutter app's assets:

```bash
cp ../message_of_quran/assets/db/quran_asad_combined_nw.sqlite data/
cp ../message_of_quran/assets/db/DB.db data/mushaf.db
```

Both are opened read-only. Point `DATA_DIR` at another directory to override.

`npm run schema` prints every table with its columns and row count.

## Pointing the app at this API

The Flutter client reads its base URL from a compile-time define, defaulting to
`http://localhost:3000/api/v1`:

```bash
flutter run --dart-define=MOQ_API_BASE_URL=https://your-host/api/v1
```

On the Android emulator, `localhost` is the emulator itself — use
`http://10.0.2.2:3000/api/v1`.

## API

Everything is `GET`, and every route is mounted under `/api/v1`. Endpoints return
**raw database rows**, so the Dart models parse the original column names
unchanged. A `?malayalam=true` query parameter switches an endpoint to its
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

`/contact/info` and `/help` always return `[]` — their tables are not present in
the shipped database, matching the app's existing behaviour.

### Mushaf

Page rendering and glyph data, backed by `mushaf.db`: `/mushaf/pages/meta`,
`/mushaf/pages/:page/lines`, `/mushaf/pages/:page/meta`, `/mushaf/pages/ayas`,
`/mushaf/surahs/glyphs`, `/mushaf/surahs/:surah/glyph`,
`/mushaf/surahs/:surah/bismillah-glyph`, `/mushaf/bismillah-glyphs`,
`/mushaf/surahs/:surah/first-page`, `/mushaf/surahs/:surah/continuous-aya-ids`,
`/mushaf/juzs/first-pages`, `/mushaf/juzs/:juz/name`,
`/mushaf/ayas/:continuousAyaId/page`, `/mushaf/ayas/continuous-id`,
`/mushaf/ayas/:continuousAyaId/info`.

`/mushaf/juzs/:juz/name` always returns `{name: ""}`: the `t_juznames` table it
reads is missing from the shipped mushaf database, which is why the app already
falls back to an empty name.

### Tajweed

`/tajweed/words?surah=&verseFrom=&verseTo=` and `/tajweed/image-urls`.

## What stayed in the app

Bookmarks, reading progressions, and settings remain in the app's local
`user_data.db` and `SharedPreferences`. They are per-device user data, not
shared content, so they are deliberately not served from here.

## Layout

```
src/
  server.js        express app, route mounting, error handling
  db/index.js      opens both sqlite files read-only
  utils.js         param parsing, HttpError, async route wrapper
  routes/          one module per resource group
scripts/
  dump-schema.js   prints table/column/row-count listing
data/              sqlite files (gitignored)
```
