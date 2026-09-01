// Pushes the English verse-split fixes (already applied to the staging
// sqlite by fix-english-verse-splits.js + manual recoveries) into live
// MongoDB. Diffs every row in the staging sqlite's `verses` table against
// the live `verses` collection directly, rather than relying on a
// previously-exported diff file, so this is safe to re-run at any time.
//
//   node scripts/push-verse-fixes-to-mongo.js            (dry run)
//   node scripts/push-verse-fixes-to-mongo.js --write     (apply)

import { config } from '../src/config.js';
import '../src/dns.js';
import { DatabaseSync } from 'node:sqlite';
import { MongoClient } from 'mongodb';
import { pad, stripPunctuation } from '../src/search-text.js';

const WRITE = process.argv.includes('--write');

const sqliteDb = new DatabaseSync(`${config.dataDir}/quran_asad_combined_nw.sqlite`);
const staged = sqliteDb.prepare('SELECT surah_number, verse_number, text FROM verses').all();

const client = new MongoClient(config.mongo.uri);
await client.connect();
const db = client.db(config.mongo.dbName);
const verses = db.collection('verses');

const maxIdDoc = await verses.find().sort({ id: -1 }).limit(1).toArray();
let nextId = (maxIdDoc[0]?.id ?? 0) + 1;

const updates = [];
const inserts = [];

for (const row of staged) {
  const live = await verses.findOne(
    { surah_number: row.surah_number, verse_number: row.verse_number },
    { projection: { _id: 1, text: 1 } },
  );
  if (!live) {
    inserts.push(row);
  } else if (live.text !== row.text) {
    updates.push({ _id: live._id, ...row });
  }
}

console.log(`${updates.length} updates, ${inserts.length} inserts`);
for (const u of updates) console.log(`  UPDATE ${u.surah_number}:${u.verse_number}`);
for (const i of inserts) console.log(`  INSERT ${i.surah_number}:${i.verse_number}`);

if (WRITE) {
  for (const u of updates) {
    await verses.updateOne(
      { _id: u._id },
      { $set: { text: u.text, search_text: pad(stripPunctuation(u.text)) } },
    );
  }
  for (const ins of inserts) {
    await verses.insertOne({
      id: nextId++,
      surah_number: ins.surah_number,
      verse_number: ins.verse_number,
      text: ins.text,
      search_text: pad(stripPunctuation(ins.text)),
    });
  }
  console.log(`\nApplied ${updates.length} updates, ${inserts.length} inserts to live MongoDB.`);
} else {
  console.log('\nDry run — re-run with --write to apply.');
}

await client.close();
