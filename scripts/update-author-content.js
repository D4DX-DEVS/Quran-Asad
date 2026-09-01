// One-time: push the corrected Author page content (already updated in
// the staging sqlite file via scripts/update_author_content.py, run from
// the message_of_quran repo) into MongoDB.
//
//   node scripts/update-author-content.js

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

const englishRow = sqliteDb
  .prepare("SELECT * FROM authors WHERE id = 'muhammad_asad'")
  .get();
const malayalamRow = sqliteDb
  .prepare('SELECT * FROM malayalam_authors WHERE id = 1')
  .get();

if (!englishRow || !malayalamRow) {
  console.error('Author rows not found in the staging sqlite file.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

await db
  .collection('authors')
  .updateOne({ id: englishRow.id }, { $set: { html_content: englishRow.html_content } });

await db
  .collection('malayalam_authors')
  .updateOne({ id: malayalamRow.id }, { $set: { html_content: malayalamRow.html_content } });

console.log('Updated authors + malayalam_authors html_content in MongoDB.');

await client.close();
