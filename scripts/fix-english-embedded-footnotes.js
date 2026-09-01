// One-time: push the repaired English footnotes and verses (fixed in the
// staging sqlite via
// ../message_of_quran/scripts/fix_english_embedded_footnotes.py) into MongoDB.
//
// Covers:
//   - `footnotes` for surahs 2, 6, 11, 12, 15, 16, 20, 62 -- 27 footnotes that
//     had been absorbed into the preceding footnote's text were split back out,
//     which also shortens each holder footnote.
//   - `verses` for surahs 37, 90, 96, 100 -- stray leading verse-number
//     prefixes removed.
//
// Uses the same transforms migrate-to-mongo.js applies to those tables so the
// re-pushed documents match every other document exactly.
//
//   node scripts/fix-english-embedded-footnotes.js

import { config } from '../src/config.js';
import '../src/dns.js';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';
import { stripPunctuation, pad } from '../src/search-text.js';
import { repairVerseText } from '../src/text-repairs.js';

const FOOTNOTE_CHAPTERS = [2, 6, 11, 12, 15, 16, 20, 62];
const VERSE_CHAPTERS = [37, 90, 96, 100];

const { uri, dbName } = config.mongo;
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to .env first.');
  process.exit(1);
}

const sqliteDb = new DatabaseSync(`${config.dataDir}/quran_asad_combined_nw.sqlite`);

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

for (const chapter of FOOTNOTE_CHAPTERS) {
  const rows = sqliteDb
    .prepare('SELECT * FROM footnotes WHERE surah_number = ? ORDER BY footnote_number')
    .all(chapter);

  if (rows.length === 0) {
    console.error(`No footnotes found for surah ${chapter}; skipping.`);
    continue;
  }
  const blank = rows.filter((r) => !r.text);
  if (blank.length > 0) {
    console.error(`Surah ${chapter} has ${blank.length} blank footnote(s); skipping.`);
    continue;
  }

  await db.collection('footnotes').deleteMany({ surah_number: chapter });
  await db.collection('footnotes').insertMany(
    rows.map((row) => ({ ...row, search_text: pad(stripPunctuation(row.text)) })),
  );
  console.log(`footnotes surah ${chapter}: re-pushed ${rows.length}.`);
}

for (const chapter of VERSE_CHAPTERS) {
  const rows = sqliteDb
    .prepare('SELECT * FROM verses WHERE surah_number = ? ORDER BY verse_number')
    .all(chapter);

  if (rows.length === 0) {
    console.error(`No verses found for surah ${chapter}; skipping.`);
    continue;
  }

  await db.collection('verses').deleteMany({ surah_number: chapter });
  await db.collection('verses').insertMany(
    rows.map((row) => {
      const text = repairVerseText(row.surah_number, row.verse_number, row.text);
      return { ...row, text, search_text: pad(stripPunctuation(text)) };
    }),
  );
  console.log(`verses surah ${chapter}: re-pushed ${rows.length}.`);
}

await client.close();
