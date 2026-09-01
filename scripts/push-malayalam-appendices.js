// One-time: push the revised Malayalam appendices I-IV into MongoDB, after
// they were replaced in the staging sqlite via
// ../message_of_quran/scripts/update_malayalam_appendices.py
//
// migrate-to-mongo.js copies this table straight across with no transform and
// no indexes, so this does the same.
//
//   node scripts/push-malayalam-appendices.js

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
const rows = sqliteDb.prepare('SELECT * FROM malayalam_appendices ORDER BY number').all();

if (rows.length !== 4) {
  console.error(`Expected 4 appendices in the staging sqlite file, found ${rows.length}.`);
  process.exit(1);
}
if (rows.some((r) => !r.body || !r.title)) {
  console.error('An appendix has no title or body; refusing to push.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db.collection('malayalam_appendices').deleteMany({});
await db.collection('malayalam_appendices').insertMany(rows.map((row) => ({ ...row })));

console.log(
  `malayalam_appendices: re-pushed ${rows.length} row(s) — ` +
    rows.map((r) => `${r.roman_numeral}:${r.body.length}`).join(', '),
);

await client.close();
