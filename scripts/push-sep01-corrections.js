// One-time: push the 2026-09-01 corrections into MongoDB, after they were
// applied to the staging sqlite via
// ../message_of_quran/scripts/apply_sep01_content_corrections.py
//
//   malayalam_about_translator  three wording fixes in the children list
//   contact_us_content          adds Mishari Rashid Al-Afasy to the reciters
//   authors                     byline now reads "by K.C. Saleem"
//
// migrate-to-mongo.js copies all three tables straight across with no
// transform and no indexes, so this does the same.
//
//   node scripts/push-sep01-corrections.js

import { config } from '../src/config.js';
import '../src/dns.js';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';

const { uri, dbName } = config.mongo;
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to .env first.');
  process.exit(1);
}

const sqliteDb = new DatabaseSync(`${config.dataDir}/quran_asad_combined_nw.sqlite`);

// table -> the column that must be non-empty for the push to be worth making
const tables = {
  malayalam_about_translator: 'bio',
  contact_us_content: 'description',
  authors: 'html_content',
};

const payload = {};
for (const [table, column] of Object.entries(tables)) {
  const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.error(`${table} is empty in the staging sqlite file.`);
    process.exit(1);
  }
  if (rows.some((r) => !r[column])) {
    console.error(`${table}: a row has no ${column}; refusing to push.`);
    process.exit(1);
  }
  payload[table] = rows;
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

for (const [table, column] of Object.entries(tables)) {
  const rows = payload[table];
  await db.collection(table).deleteMany({});
  await db.collection(table).insertMany(rows.map((row) => ({ ...row })));
  console.log(`${table}: re-pushed ${rows.length} row(s) (${rows[0][column].length} chars).`);
}

await client.close();
