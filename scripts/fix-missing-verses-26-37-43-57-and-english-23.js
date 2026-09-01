// One-time: push the repaired verse rows (fixed in the staging sqlite file via
// ../message_of_quran/scripts/fix_missing_verses_26_37_43_57_and_english_23.py)
// into MongoDB.
//
// Covers:
//   - Malayalam verses for surahs 26, 37, 43, 57 (blank/merged rows repaired)
//   - English verses for surah 23 (verse 95 was merged into 96; now split)
//
// Only the verse documents are re-pushed; footnotes and surah metadata are
// unchanged by that repair.
//
//   node scripts/fix-missing-verses-26-37-43-57-and-english-23.js

import { config } from '../src/config.js';
import '../src/dns.js';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';
import { stripPunctuation, pad } from '../src/search-text.js';
import { repairVerseText } from '../src/text-repairs.js';

const ML_CHAPTERS = [26, 37, 43, 57];
const EN_CHAPTER = 23;

const { uri, dbName } = config.mongo;
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to .env first.');
  process.exit(1);
}

const sqliteDb = new DatabaseSync(`${config.dataDir}/quran_asad_combined_nw.sqlite`);

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

for (const chapter of ML_CHAPTERS) {
  const verseRows = sqliteDb
    .prepare('SELECT * FROM malayalam_verses WHERE surah_id = ? ORDER BY verse_number')
    .all(chapter);

  if (verseRows.length === 0) {
    console.error(`No Malayalam verses found for surah ${chapter}; skipping.`);
    continue;
  }

  const blank = verseRows.filter((r) => !r.malayalam_translation);
  if (blank.length > 0) {
    console.error(
      `Surah ${chapter} still has ${blank.length} blank verse(s) in sqlite; ` +
        'run the python repair first. Skipping.',
    );
    continue;
  }

  await db.collection('malayalam_verses').deleteMany({ surah_id: chapter });
  await db.collection('malayalam_verses').insertMany(
    verseRows.map((row) => ({
      ...row,
      search_text: pad((row.malayalam_translation ?? '').toLowerCase()),
    })),
  );
  console.log(`Malayalam surah ${chapter}: re-pushed ${verseRows.length} verses.`);
}

const enRows = sqliteDb
  .prepare('SELECT * FROM verses WHERE surah_number = ? ORDER BY verse_number')
  .all(EN_CHAPTER);

if (enRows.length === 0) {
  console.error(`No English verses found for surah ${EN_CHAPTER}.`);
} else {
  // Same transform migrate-to-mongo.js applies to the `verses` table, so the
  // re-pushed documents match every other verse document exactly.
  await db.collection('verses').deleteMany({ surah_number: EN_CHAPTER });
  await db.collection('verses').insertMany(
    enRows.map((row) => {
      const text = repairVerseText(row.surah_number, row.verse_number, row.text);
      return { ...row, text, search_text: pad(stripPunctuation(text)) };
    }),
  );
  console.log(`English surah ${EN_CHAPTER}: re-pushed ${enRows.length} verses.`);
}

await client.close();
