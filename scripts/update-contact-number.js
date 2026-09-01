// One-time: push the updated Contact Us phone number (already updated in
// the staging sqlite file directly) into MongoDB.
//
//   node scripts/update-contact-number.js

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

const englishRow = sqliteDb.prepare('SELECT * FROM contact_us_content').get();
const malayalamRow = sqliteDb.prepare('SELECT * FROM malayalam_contact_us').get();

if (!englishRow || !malayalamRow) {
  console.error('Contact rows not found in the staging sqlite file.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db
  .collection('contact_us_content')
  .updateOne({ id: englishRow.id }, { $set: { mobile: englishRow.mobile } });

await db
  .collection('malayalam_contact_us')
  .updateOne({ id: malayalamRow.id }, { $set: { mobile: malayalamRow.mobile } });

console.log('Updated contact_us_content + malayalam_contact_us mobile in MongoDB.');

await client.close();
