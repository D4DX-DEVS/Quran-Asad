// One-shot migration: copies the tables the API actually serves out of the two
// read-only sqlite files and into MongoDB. Re-runnable — each collection is
// dropped and rebuilt.
//
//   node scripts/migrate-to-mongo.js
//
// The sqlite files are only needed to run this; once the data is in Mongo the
// server never touches them again.

import { config } from '../src/config.js';
import '../src/dns.js';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';

import {
  normalizeArabic,
  stripPunctuation,
  stripFootnotePunctuation,
  pad,
} from '../src/search-text.js';
import { repairVerseText, repairSurahRow } from '../src/text-repairs.js';

const dataDir = config.dataDir;
const { uri, dbName } = config.mongo;

if (!uri) {
  console.error('MONGODB_URI is not set. Add it to .env first.');
  process.exit(1);
}

// Each entry: the sqlite table, the Mongo collection it becomes, the indexes to
// build, and an optional row transform that precomputes search columns.
const QURAN_TABLES = [
  { table: 'surahs', indexes: [{ number: 1 }], transform: repairSurahRow },
  { table: 'malayalam_surahs', indexes: [{ chapter_number: 1 }] },
  { table: 'juzzs', indexes: [{ custom_id: 1 }] },
  { table: 'hizbs', indexes: [{ custom_id: 1 }] },
  {
    table: 'verses',
    indexes: [{ surah_number: 1, verse_number: 1 }],
    transform: (row) => {
      const text = repairVerseText(row.surah_number, row.verse_number, row.text);
      return { ...row, text, search_text: pad(stripPunctuation(text)) };
    },
  },
  {
    table: 'malayalam_verses',
    indexes: [{ surah_id: 1, verse_number: 1 }],
    // The Malayalam verse search padded the raw column without stripping
    // punctuation, unlike every other search.
    transform: (row) => ({
      ...row,
      search_text: pad((row.malayalam_translation ?? '').toLowerCase()),
    }),
  },
  {
    table: 'quranayas',
    indexes: [{ suraid: 1, ayaid: 1 }],
    transform: (row) => ({ ...row, search_arabic: pad(normalizeArabic(row.AyaHText)) }),
  },
  {
    table: 'footnotes',
    indexes: [{ surah_number: 1, footnote_number: 1 }],
    transform: (row) => ({ ...row, search_text: pad(stripPunctuation(row.text)) }),
  },
  {
    table: 'malayalam_footnotes',
    indexes: [{ surah_number: 1, footnote_number: 1 }, { id: 1 }],
    transform: (row) => ({
      ...row,
      search_content: pad(stripFootnotePunctuation(row.content)),
    }),
  },
  { table: 'appendices', indexes: [{ number: 1 }] },
  { table: 'malayalam_appendices', indexes: [{ number: 1 }] },
  { table: 'foreword', indexes: [] },
  { table: 'malayalam_foreword', indexes: [] },
  { table: 'authors', indexes: [] },
  { table: 'malayalam_authors', indexes: [] },
  { table: 'malayalam_about_translator', indexes: [] },
  { table: 'translator', indexes: [] },
  { table: 'worksofreference', indexes: [] },
  { table: 'contact_us_content', indexes: [] },
  { table: 'malayalam_contact_us', indexes: [] },
];

// mushaf.db table names collide conceptually with the quran ones, so they get a
// prefix and lose the `t_` convention.
const MUSHAF_TABLES = [
  {
    table: 't_MushafPages',
    collection: 'mushaf_pages',
    indexes: [{ pageid: 1, id: 1 }, { line: 1, suraid: 1, id: 1 }],
  },
  {
    table: 't_ayawise_page',
    collection: 'mushaf_ayawise_page',
    indexes: [{ p_id: 1 }, { s_aya: 1, e_aya: 1 }, { j_no: 1 }],
  },
  {
    table: 't_aya',
    collection: 'mushaf_aya',
    indexes: [{ aya_id: 1 }, { s_no: 1, aya_no: 1 }],
  },
  {
    // Only the font-zip columns are read, but the table is 604 rows, so it is
    // copied whole rather than reshaped.
    table: 't_linewise_page',
    collection: 'mushaf_linewise_page',
    indexes: [{ fontstatus: 1, fontzip: 1 }],
  },
];

const BATCH = 2000;

const copyTable = async (sqlite, mongo, spec) => {
  const collectionName = spec.collection ?? spec.table;
  const collection = mongo.collection(collectionName);
  await collection.drop().catch(() => {}); // absent on a first run

  const rows = sqlite.prepare(`SELECT * FROM "${spec.table}"`).all();
  const docs = rows.map((row) => {
    // node:sqlite hands back null-prototype objects; Mongo needs plain ones.
    const plain = { ...row };
    return spec.transform ? spec.transform(plain) : plain;
  });

  for (let i = 0; i < docs.length; i += BATCH) {
    await collection.insertMany(docs.slice(i, i + BATCH), { ordered: false });
  }
  for (const index of spec.indexes) await collection.createIndex(index);

  console.log(`${collectionName.padEnd(28)} ${String(docs.length).padStart(6)} docs`);
  return docs.length;
};

// The colour-coded Tajweed data ships as one ~5.5 MB JSON keyed by surah, each
// holding a list of verses. It becomes one document per verse so a screen can
// fetch a single surah instead of the whole book.
const copyTajweedHtml = async (mongo) => {
  const file = path.join(dataDir, 'quran_tajweed_complete.json');
  if (!existsSync(file)) {
    console.log('tajweed_html                  skipped (source JSON not in data/)');
    return 0;
  }

  const collection = mongo.collection('tajweed_html');
  await collection.drop().catch(() => {});

  const source = JSON.parse(readFileSync(file, 'utf8'));
  const docs = [];
  for (const surah of Object.values(source)) {
    for (const verse of surah?.verses ?? []) {
      const { verse_key: verseKey, text_tajweed_html: html } = verse;
      if (typeof verseKey !== 'string' || typeof html !== 'string') continue;
      const [surahNumber, verseNumber] = verseKey.split(':').map(Number);
      docs.push({
        surah_number: surahNumber,
        verse_number: verseNumber,
        verse_key: verseKey,
        text_tajweed_html: html,
      });
    }
  }

  for (let i = 0; i < docs.length; i += BATCH) {
    await collection.insertMany(docs.slice(i, i + BATCH), { ordered: false });
  }
  await collection.createIndex({ surah_number: 1, verse_number: 1 });

  console.log(`${'tajweed_html'.padEnd(28)} ${String(docs.length).padStart(6)} docs`);
  return docs.length;
};

const client = new MongoClient(uri);
await client.connect();
const mongo = client.db(dbName);
console.log(`→ ${mongo.databaseName}\n`);

let total = 0;
for (const [file, specs] of [
  ['quran_asad_combined_nw.sqlite', QURAN_TABLES],
  ['mushaf.db', MUSHAF_TABLES],
]) {
  const sqlite = new DatabaseSync(path.join(dataDir, file), { readOnly: true });
  for (const spec of specs) total += await copyTable(sqlite, mongo, spec);
  sqlite.close();
}

total += await copyTajweedHtml(mongo);

console.log(`\ndone — ${total} documents`);
await client.close();
