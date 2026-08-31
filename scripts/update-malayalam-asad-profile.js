// One-time: push the updated Malayalam Muhammad Asad profile
// (`malayalam_authors`) into MongoDB, after it was replaced in the staging
// sqlite via ../message_of_quran/scripts/update_malayalam_asad_profile.py
//
// migrate-to-mongo.js copies this table straight across with no transform and
// no indexes, so this does the same.
//
//   node scripts/update-malayalam-asad-profile.js

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
const rows = sqliteDb.prepare('SELECT * FROM malayalam_authors').all();

if (rows.length === 0) {
  console.error('malayalam_authors is empty in the staging sqlite file.');
  process.exit(1);
}
const empty = rows.filter((r) => !r.html_content);
if (empty.length > 0) {
  console.error(`${empty.length} row(s) have no html_content; refusing to push.`);
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db.collection('malayalam_authors').deleteMany({});
await db.collection('malayalam_authors').insertMany(rows.map((row) => ({ ...row })));

console.log(
  `malayalam_authors: re-pushed ${rows.length} row(s) ` +
    `(${rows[0].html_content.length} chars).`,
);

await client.close();
