// For every missing verse, slice body_raw between the last marker for the
// previous verse and the first marker for the next verse, so we can see
// directly what's there regardless of which marker style the source used
// (standalone "S:V", inline "(S:V)", or "S:(V)").
//
//   DNS_SERVERS=8.8.8.8,1.1.1.1 node scripts/audit-missing-verses-recoverability.js

import { config } from '../src/config.js';
import '../src/dns.js';
import { MongoClient } from 'mongodb';

const client = new MongoClient(config.mongo.uri);
await client.connect();
const db = client.db(config.mongo.dbName);

const missing = {
  7: [40, 54],
  8: [66, 72],
  11: [25],
  12: [69],
  15: [63],
  18: [9, 29],
  19: [2, 30],
  23: [95],
  25: [45],
  26: [2, 111, 170],
  28: [2],
  29: [2],
  30: [2, 47],
  31: [2, 28],
  32: [2, 7, 15],
  33: [50],
  34: [19],
  37: [101],
  40: [2],
  41: [2],
  43: [2, 57],
  44: [2],
  45: [2],
  46: [2],
  51: [41],
  58: [15],
  75: [34, 35],
};

function markerPositions(raw, surah, verse) {
  const patterns = [
    new RegExp(`(?:^|\\n)${surah}:${verse}(?:\\n|$)`, 'g'),
    new RegExp(`\\(${surah}:${verse}\\)`, 'g'),
    new RegExp(`${surah}:\\(${verse}\\)`, 'g'),
  ];
  const positions = [];
  for (const p of patterns) {
    let m;
    while ((m = p.exec(raw))) positions.push({ start: m.index, end: m.index + m[0].length });
  }
  return positions;
}

for (const [surahStr, verses] of Object.entries(missing)) {
  const surah = Number(surahStr);
  const row = await db.collection('surahs').findOne({ number: surah }, { projection: { body_raw: 1 } });
  const raw = row?.body_raw || '';

  for (const v of verses) {
    const prevMarks = markerPositions(raw, surah, v - 1);
    const nextMarks = markerPositions(raw, surah, v + 1);
    if (prevMarks.length === 0 || nextMarks.length === 0) {
      console.log(`\n=== surah ${surah} verse ${v}: could not locate neighboring markers (prev=${prevMarks.length}, next=${nextMarks.length}) ===`);
      continue;
    }
    const start = prevMarks[prevMarks.length - 1].end;
    const end = nextMarks[0].start;
    const slice = raw.slice(start, end).trim();
    console.log(`\n=== surah ${surah} verse ${v} (between v${v - 1} and v${v + 1}) ===`);
    console.log(slice.length > 400 ? slice.slice(0, 400) + '…[truncated]' : slice);
  }
}

await client.close();
