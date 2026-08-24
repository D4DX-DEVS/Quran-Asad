// Diffs the current staging sqlite's `verses` table against the pre-fix
// backup to produce the exact set of INSERT/UPDATE statements applied
// today, so the same fixes can be mirrored onto the app's bundled sqlite.
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';

const before = new DatabaseSync('data/quran_asad_combined_nw.sqlite.bak-verse-fix');
const after = new DatabaseSync('data/quran_asad_combined_nw.sqlite');

const beforeRows = new Map(
  before
    .prepare('SELECT surah_number, verse_number, text FROM verses')
    .all()
    .map((r) => [`${r.surah_number}:${r.verse_number}`, r.text]),
);

const afterRows = after.prepare('SELECT surah_number, verse_number, text FROM verses').all();

const updates = [];
const inserts = [];

for (const row of afterRows) {
  const key = `${row.surah_number}:${row.verse_number}`;
  if (!beforeRows.has(key)) {
    inserts.push({ surah: row.surah_number, verse: row.verse_number, text: row.text });
  } else if (beforeRows.get(key) !== row.text) {
    updates.push({ surah: row.surah_number, verse: row.verse_number, text: row.text });
  }
}

writeFileSync('scripts/_verse-fix-diff.json', JSON.stringify({ updates, inserts }, null, 2));
console.log(`${updates.length} updates, ${inserts.length} inserts written to scripts/_verse-fix-diff.json`);
