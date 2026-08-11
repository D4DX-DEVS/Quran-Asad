import { DatabaseSync } from 'node:sqlite';
for (const f of ['data/quran_asad_combined_nw.sqlite', 'data/mushaf.db']) {
  const db = new DatabaseSync(f, { readOnly: true });
  console.log('\n########', f);
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()) {
    const cols = db.prepare(`PRAGMA table_info("${name}")`).all().map(c => c.name).join(', ');
    const n = db.prepare(`SELECT COUNT(*) c FROM "${name}"`).get().c;
    console.log(`${name} (${n}) :: ${cols}`);
  }
  db.close();
}
