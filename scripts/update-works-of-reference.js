// One-time: push the updated References section (`worksofreference`) into
// MongoDB, after it was replaced in the staging sqlite via
// ../message_of_quran/scripts/update_works_of_reference.py
//
// migrate-to-mongo.js copies this table straight across with no transform,
// so this does the same.
//
//   node scripts/update-works-of-reference.js

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
const rows = sqliteDb.prepare('SELECT * FROM worksofreference').all();

if (rows.length === 0) {
  console.error('worksofreference is empty in the staging sqlite file.');
  process.exit(1);
}
if (rows.some((r) => !r.html_content)) {
  console.error('A row has no html_content; refusing to push.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db.collection('worksofreference').deleteMany({});
await db.collection('worksofreference').insertMany(rows.map((row) => ({ ...row })));

console.log(
  `worksofreference: re-pushed ${rows.length} row(s) ` +
    `(${rows[0].html_content.length} chars).`,
);

await client.close();
