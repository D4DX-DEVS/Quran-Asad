// One-time: push both Muhammad Asad author pages (`authors` and
// `malayalam_authors`) into MongoDB, after they were changed in the staging
// sqlite via ../message_of_quran/scripts/restore_malayalam_asad_byline.py and
// ../message_of_quran/scripts/update_english_asad_profile.py
//
// migrate-to-mongo.js copies both tables straight across with no transform and
// no indexes, so this does the same.
//
//   node scripts/update-asad-author-pages.js

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

const tables = ['authors', 'malayalam_authors'];
const payload = {};

for (const table of tables) {
  const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
  if (rows.length === 0) {
    console.error(`${table} is empty in the staging sqlite file.`);
    process.exit(1);
  }
  const empty = rows.filter((r) => !r.html_content);
  if (empty.length > 0) {
    console.error(`${table}: ${empty.length} row(s) have no html_content; refusing to push.`);
    process.exit(1);
  }
  payload[table] = rows;
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

for (const table of tables) {
  const rows = payload[table];
  await db.collection(table).deleteMany({});
  await db.collection(table).insertMany(rows.map((row) => ({ ...row })));
  console.log(
    `${table}: re-pushed ${rows.length} row(s) (${rows[0].html_content.length} chars).`,
  );
}

await client.close();
