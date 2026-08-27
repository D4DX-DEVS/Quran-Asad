// One-time: push the Surah 82 Malayalam rows (already inserted into the
// staging sqlite file via ../message_of_quran/scripts/add_malayalam_surah82.py)
// into MongoDB. Mirrors migrate-to-mongo.js's transform for
// malayalam_verses/footnotes.
//
//   node scripts/add-malayalam-surah82.js

import { config } from '../src/config.js';
import '../src/dns.js';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';
import { stripFootnotePunctuation, pad } from '../src/search-text.js';

const CHAPTER = 82;

const { uri, dbName } = config.mongo;
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to .env first.');
  process.exit(1);
}

const sqliteDb = new DatabaseSync(`${config.dataDir}/quran_asad_combined_nw.sqlite`);

const surahRow = sqliteDb
  .prepare('SELECT * FROM malayalam_surahs WHERE chapter_number = ?')
  .get(CHAPTER);
const verseRows = sqliteDb
  .prepare('SELECT * FROM malayalam_verses WHERE surah_id = ? ORDER BY verse_number')
  .all(CHAPTER);
const footnoteRows = sqliteDb
  .prepare('SELECT * FROM malayalam_footnotes WHERE surah_number = ? ORDER BY footnote_number')
  .all(CHAPTER);

if (!surahRow || verseRows.length === 0) {
  console.error(`No surah ${CHAPTER} data found in the staging sqlite file.`);
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db.collection('malayalam_surahs').deleteMany({ chapter_number: CHAPTER });
await db.collection('malayalam_surahs').insertOne({ ...surahRow });

await db.collection('malayalam_verses').deleteMany({ surah_id: CHAPTER });
await db.collection('malayalam_verses').insertMany(
  verseRows.map((row) => ({
    ...row,
    search_text: pad((row.malayalam_translation ?? '').toLowerCase()),
  })),
);

await db.collection('malayalam_footnotes').deleteMany({ surah_number: CHAPTER });
await db.collection('malayalam_footnotes').insertMany(
  footnoteRows.map((row) => ({
    ...row,
    search_content: pad(stripFootnotePunctuation(row.content)),
  })),
);

console.log(
  `Inserted surah ${CHAPTER}: 1 surah row, ${verseRows.length} verses, ` +
    `${footnoteRows.length} footnotes.`,
);

await client.close();
