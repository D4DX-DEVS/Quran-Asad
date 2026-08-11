import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dataDir = process.env.DATA_DIR ?? path.join(rootDir, 'data');

export const quranDb = new DatabaseSync(
  path.join(dataDir, 'quran_asad_combined_nw.sqlite'),
  { readOnly: true },
);

export const mushafDb = new DatabaseSync(path.join(dataDir, 'mushaf.db'), {
  readOnly: true,
});

// node:sqlite rows are null-prototype objects; Express' JSON serializer needs plain objects.
export const all = (db, sql, ...params) =>
  db.prepare(sql).all(...params).map((row) => ({ ...row }));

export const one = (db, sql, ...params) => {
  const row = db.prepare(sql).get(...params);
  return row ? { ...row } : null;
};

export const closeAll = () => {
  quranDb.close();
  mushafDb.close();
};
