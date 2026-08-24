// Recovers English verses that exist in `surahs.body_raw` but got merged
// into the preceding verse's row during the original migration, instead of
// being split into their own row. Every marker string below was manually
// confirmed present in body_raw before being hardcoded here — no guessing.
//
// Dry-run by default (prints before/after for review, touches nothing).
// Pass --apply to write to data/quran_asad_combined_nw.sqlite.
//
//   node scripts/fix-english-verse-splits.js            (dry run)
//   node scripts/fix-english-verse-splits.js --apply    (writes to staging sqlite)

import { DatabaseSync } from 'node:sqlite';

const APPLY = process.argv.includes('--apply');
const db = new DatabaseSync('data/quran_asad_combined_nw.sqlite');

// implicit2: opening letters + "(1)" + verse 2 text, no marker at all for v2
//   -> split verse 1's stored text right after the first "(\d+)".
// marker: an explicit (if garbled) marker string for this verse, confirmed
//   present in body_raw by manual inspection -> hardcoded exact substring.
const implicit2 = [19, 26, 28, 29, 30, 31, 32, 40, 41, 43, 44, 45, 46];

const markerCases = [
  { surah: 11, verse: 25, prevVerse: 24, marker: '11:(25)' },
  { surah: 19, verse: 30, prevVerse: 29, marker: '19:(30)' },
  { surah: 25, verse: 45, prevVerse: 44, marker: '45)' },
  { surah: 26, verse: 170, prevVerse: 169, marker: '(26:70)' }, // OCR dropped leading "1"
  { surah: 30, verse: 47, prevVerse: 46, marker: '30;(47)' },
  { surah: 31, verse: 28, prevVerse: 27, marker: '(31: /?/28)' },
  { surah: 32, verse: 7, prevVerse: 6, marker: '(32:7d)' },
  { surah: 32, verse: 15, prevVerse: 14, marker: '32;(15)' },
  { surah: 33, verse: 51, prevVerse: 50, marker: null }, // verse 50 also absent; handled separately below
  { surah: 34, verse: 20, prevVerse: 19, marker: null }, // verse 19 also absent
  { surah: 37, verse: 101, prevVerse: 100, marker: '(37:l01)' },
  { surah: 43, verse: 58, prevVerse: 57, marker: null }, // verse 57 also absent
  { surah: 51, verse: 42, prevVerse: 41, marker: null }, // verse 41 also absent
];

const results = [];

function firstFootnoteMarkerEnd(text) {
  const m = /\(\d+\)/.exec(text);
  return m ? m.index + m[0].length : -1;
}

for (const surah of implicit2) {
  const v1 = db.prepare('SELECT * FROM verses WHERE surah_number = ? AND verse_number = 1').get(surah);
  if (!v1) { results.push({ surah, verse: 2, error: 'verse 1 row not found' }); continue; }
  const splitAt = firstFootnoteMarkerEnd(v1.text);
  if (splitAt < 0) { results.push({ surah, verse: 2, error: 'no footnote marker in verse 1 text' }); continue; }
  const newV1Text = v1.text.slice(0, splitAt).trim();
  const newV2Text = v1.text.slice(splitAt).trim();
  results.push({
    surah, verse: 2, insertText: newV2Text,
    prevVerse: 1, oldPrevText: v1.text, newPrevText: newV1Text,
  });
}

for (const { surah, verse, prevVerse, marker } of markerCases) {
  const prevRow = db
    .prepare('SELECT * FROM verses WHERE surah_number = ? AND verse_number = ?')
    .get(surah, prevVerse);

  if (!marker) {
    // The verse whose row would need trimming is itself missing (already
    // flagged separately) — we still need to know where THIS verse's text
    // starts/ends within body_raw, but with no marker for it and no clean
    // predecessor row, skip: flagged for manual handling.
    results.push({ surah, verse, error: `previous verse ${prevVerse} also missing — needs manual handling together` });
    continue;
  }

  const row = db.prepare('SELECT body_raw FROM surahs WHERE number = ?').get(surah);
  const raw = row?.body_raw || '';
  const idx = raw.indexOf(marker);
  if (idx < 0) { results.push({ surah, verse, error: `marker "${marker}" not found in body_raw` }); continue; }
  const afterMarker = idx + marker.length;

  // find the next marker of ANY known style to bound the end of this verse's text
  const nextCandidates = [
    `\n${surah}:${verse + 1}\n`,
    `(${surah}:${verse + 1})`,
    `${surah}:(${verse + 1})`,
    `${surah};(${verse + 1})`,
  ];
  let sliceEnd = raw.length;
  for (const cand of nextCandidates) {
    const i = raw.indexOf(cand, afterMarker);
    if (i >= 0) sliceEnd = Math.min(sliceEnd, i);
  }
  const insertText = raw.slice(afterMarker, sliceEnd).trim();

  if (!prevRow) {
    results.push({ surah, verse, error: `previous verse ${prevVerse} row not found (marker found, but nothing to trim)`, insertText });
    continue;
  }

  const markerIdxInPrev = prevRow.text.indexOf(marker);
  if (markerIdxInPrev < 0) {
    results.push({ surah, verse, error: `marker "${marker}" found in body_raw but not in verse ${prevVerse}'s stored text — mismatch, needs manual check`, insertText });
    continue;
  }
  const newPrevText = prevRow.text.slice(0, markerIdxInPrev).trim();
  results.push({
    surah, verse, insertText,
    prevVerse, oldPrevText: prevRow.text, newPrevText,
  });
}

for (const r of results) {
  console.log('\n=== Surah', r.surah, 'Verse', r.verse, '===');
  if (r.error) {
    console.log('NEEDS MANUAL REVIEW:', r.error);
    if (r.insertText) console.log('  (partial extract found:', JSON.stringify(r.insertText), ')');
    continue;
  }
  console.log('INSERT verse text:', JSON.stringify(r.insertText));
  console.log(`Verse ${r.prevVerse} OLD:`, JSON.stringify(r.oldPrevText));
  console.log(`Verse ${r.prevVerse} NEW:`, JSON.stringify(r.newPrevText));
}

const applyable = results.filter((r) => !r.error);
console.log(`\n\n${applyable.length} of ${results.length} cases ready to apply; ${results.length - applyable.length} need manual review (shown above).`);

if (APPLY) {
  const insertStmt = db.prepare(
    'INSERT INTO verses (surah_number, verse_number, text) VALUES (?, ?, ?)',
  );
  const updateStmt = db.prepare(
    'UPDATE verses SET text = ? WHERE surah_number = ? AND verse_number = ?',
  );

  db.exec('BEGIN');
  try {
    for (const r of applyable) {
      updateStmt.run(r.newPrevText, r.surah, r.prevVerse);
      insertStmt.run(r.surah, r.verse, r.insertText);
    }
    db.exec('COMMIT');
    console.log(`\nApplied ${applyable.length} fixes to data/quran_asad_combined_nw.sqlite.`);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('Failed, rolled back:', e.message);
    process.exit(1);
  }
}
