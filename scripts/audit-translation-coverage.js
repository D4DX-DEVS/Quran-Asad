// One-off audit: full English + Malayalam verse and footnote coverage across
// all 114 surahs, run directly against live Mongo (no REST round-trips).
// Reports exact missing verse numbers, not just counts.
//
//   DNS_SERVERS=8.8.8.8,1.1.1.1 node scripts/audit-translation-coverage.js

import { config } from '../src/config.js';
import '../src/dns.js';
import { MongoClient } from 'mongodb';

const { uri, dbName } = config.mongo;
if (!uri) {
  console.error('MONGODB_URI is not set. Add it to .env first.');
  process.exit(1);
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

const surahs = await db.collection('surahs').find({}).sort({ number: 1 }).toArray();

function missingNumbers(present, total) {
  const have = new Set(present);
  const missing = [];
  for (let i = 1; i <= total; i++) if (!have.has(i)) missing.push(i);
  return missing;
}

const enVersesMissing = [];
const enVersesPartial = [];
const enFootnotesMissing = [];
const mlSurahsMissing = [];
const mlVersesPartial = [];
const mlFootnotesMissing = [];

const markerRegex = /\[\^(\d+)\]/g;

const mlSurahRows = await db.collection('malayalam_surahs').find({}).toArray();
const mlSurahByChapter = new Map(mlSurahRows.map((r) => [r.chapter_number, r]));

for (const s of surahs) {
  const num = s.number;
  const expected = s.ayath_count;

  const enVerses = await db.collection('verses').find({ surah_number: num }).toArray();
  if (enVerses.length === 0) {
    enVersesMissing.push(num);
  } else if (enVerses.length < expected) {
    enVersesPartial.push({
      surah: num,
      expected,
      got: enVerses.length,
      missingVerses: missingNumbers(enVerses.map((v) => v.verse_number), expected),
    });
  }

  const referencedEn = new Set();
  for (const v of enVerses) {
    const text = v.text || '';
    let m;
    while ((m = markerRegex.exec(text))) referencedEn.add(Number(m[1]));
  }
  if (referencedEn.size > 0) {
    const enFootnoteCount = await db.collection('footnotes').countDocuments({ surah_number: num });
    if (enFootnoteCount === 0) {
      enFootnotesMissing.push({ surah: num, referencedMarkers: referencedEn.size });
    }
  }

  const mlSurah = mlSurahByChapter.get(num);
  if (!mlSurah) {
    mlSurahsMissing.push(num);
    continue;
  }

  const mlVerses = await db
    .collection('malayalam_verses')
    .find({ surah_id: num, verse_number: { $ne: null } })
    .toArray();
  if (mlVerses.length < expected) {
    mlVersesPartial.push({
      surah: num,
      expected,
      got: mlVerses.length,
      missingVerses: missingNumbers(mlVerses.map((v) => v.verse_number), expected),
    });
  }

  const referencedMl = new Set();
  for (const v of mlVerses) {
    const text = v.malayalam_translation || '';
    let m;
    while ((m = markerRegex.exec(text))) referencedMl.add(Number(m[1]));
  }
  if (referencedMl.size > 0) {
    const mlFootnoteCount = await db
      .collection('malayalam_footnotes')
      .countDocuments({ surah_number: num });
    if (mlFootnoteCount === 0) {
      mlFootnotesMissing.push({ surah: num, referencedMarkers: referencedMl.size });
    }
  }
}

const totalEnMissing = enVersesPartial.reduce((sum, s) => sum + s.missingVerses.length, 0);
const totalMlMissing = mlVersesPartial.reduce((sum, s) => sum + s.missingVerses.length, 0);

console.log('=== ENGLISH — surahs with 0 verses ===');
console.log(JSON.stringify(enVersesMissing));
console.log('=== ENGLISH — surahs with partial verse coverage (exact missing verse numbers) ===');
console.log(JSON.stringify(enVersesPartial, null, 2));
console.log('total individually missing English verses:', totalEnMissing);
console.log('=== ENGLISH — surahs referencing footnote markers but 0 footnote rows ===');
console.log(JSON.stringify(enFootnotesMissing));
console.log();
console.log('=== MALAYALAM — surahs with no malayalam_surahs entry at all ===');
console.log(JSON.stringify(mlSurahsMissing));
console.log('count:', mlSurahsMissing.length, 'of', surahs.length);
console.log('=== MALAYALAM — surahs with partial verse coverage (exact missing verse numbers) ===');
console.log(JSON.stringify(mlVersesPartial, null, 2));
console.log('total individually missing Malayalam verses (within completed surahs):', totalMlMissing);
console.log('=== MALAYALAM — surahs referencing footnote markers but 0 footnote rows ===');
console.log(JSON.stringify(mlFootnotesMissing));

await client.close();
