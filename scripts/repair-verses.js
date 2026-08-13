// Applies src/text-repairs.js to a database that is already loaded, so the
// corrections land without re-running the whole migration.
//
//   node scripts/repair-verses.js          # report what would change
//   node scripts/repair-verses.js --write  # apply
//
// `search_text` is recomputed alongside the text, since search matches against
// that precomputed column rather than the text itself.

import { config } from '../src/config.js';
import '../src/dns.js';
import { MongoClient } from 'mongodb';

import { pad, stripPunctuation } from '../src/search-text.js';
import { VERSE_REPAIRS, SURAH_REPAIRS } from '../src/text-repairs.js';

const write = process.argv.includes('--write');
const { uri, dbName } = config.mongo;
if (!uri) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);
const verses = db.collection('verses');

let changed = 0;
let already = 0;
let missing = 0;

for (const r of VERSE_REPAIRS) {
  const doc = await verses.findOne(
    { surah_number: r.surah, verse_number: r.verse },
    { projection: { _id: 1, text: 1 } },
  );

  if (!doc) {
    console.log(`${r.surah}:${r.verse}  NOT FOUND`);
    missing += 1;
    continue;
  }
  if (!doc.text.includes(r.from)) {
    const done = doc.text.includes(r.to);
    console.log(`${r.surah}:${r.verse}  ${done ? 'already repaired' : 'source text does not match — skipped'}`);
    already += 1;
    continue;
  }

  const text = doc.text.replace(r.from, r.to);
  console.log(`${r.surah}:${r.verse}  ${JSON.stringify(r.from)} -> ${JSON.stringify(r.to)}`);

  if (write) {
    await verses.updateOne(
      { _id: doc._id },
      { $set: { text, search_text: pad(stripPunctuation(text)) } },
    );
  }
  changed += 1;
}

for (const r of SURAH_REPAIRS) {
  const doc = await db.collection('surahs').findOne(
    { number: r.surah },
    { projection: { _id: 1, [r.field]: 1 } },
  );

  if (!doc) {
    console.log(`surah ${r.surah}  NOT FOUND`);
    missing += 1;
    continue;
  }
  if (doc[r.field] !== r.from) {
    const done = doc[r.field] === r.to;
    console.log(`surah ${r.surah}  ${r.field} is ${doc[r.field]} — ${done ? 'already repaired' : 'unexpected value, skipped'}`);
    already += 1;
    continue;
  }

  console.log(`surah ${r.surah}  ${r.field}: ${r.from} -> ${r.to}`);
  if (write) {
    await db.collection('surahs').updateOne({ _id: doc._id }, { $set: { [r.field]: r.to } });
  }
  changed += 1;
}

console.log(
  `\n${write ? 'applied' : 'would apply'}: ${changed} | untouched: ${already} | missing: ${missing}`,
);
if (!write && changed > 0) console.log('re-run with --write to apply');

await client.close();
