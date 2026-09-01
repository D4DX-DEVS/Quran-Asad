// One-time: push the updated English translator profile (`translator`) into
// MongoDB, after it was replaced in the staging sqlite via
// ../message_of_quran/scripts/update_english_translator_profile.py
//
// migrate-to-mongo.js copies this table straight across with no transform,
// so this does the same.
//
//   node scripts/update-english-translator-profile.js

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
const rows = sqliteDb.prepare('SELECT * FROM translator').all();

if (rows.length === 0) {
  console.error('translator is empty in the staging sqlite file.');
  process.exit(1);
}
if (rows.some((r) => !r.bio)) {
  console.error('A row has no bio; refusing to push.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db.collection('translator').deleteMany({});
await db.collection('translator').insertMany(rows.map((row) => ({ ...row })));

console.log(
  `translator: re-pushed ${rows.length} row(s) (bio ${rows[0].bio.length} chars).`,
);

await client.close();
