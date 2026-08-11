import { Router } from 'express';
import { quranDb, all, one } from '../db/index.js';
import { asInt, asBool, notFound, route } from '../utils.js';

const router = Router();

// A handful of tables referenced by the Dart helpers (`contact_us`, `help`)
// are not present in the shipped sqlite file; guard those queries instead
// of letting them throw, mirroring the Dart helpers' try/catch-to-empty behavior.
const tableExists = (name) =>
  one(
    quranDb,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    name,
  ) !== null;

// ─── Prefaces ───
// English: `surahs.introduction`. Malayalam: `malayalam_surahs.introduction`.

router.get(
  '/prefaces/general',
  route((_req, res) => {
    // PrefaceDbHelper.getGeneralPreface() always returns null in the Dart source.
    res.json(null);
  }),
);

router.get(
  '/prefaces/:surahId',
  route((req, res) => {
    const surahId = asInt(req.params.surahId, 'surahId');

    if (asBool(req.query.malayalam)) {
      const row = one(
        quranDb,
        'SELECT introduction FROM malayalam_surahs WHERE chapter_number = ? LIMIT 1',
        surahId,
      );
      if (!row || !row.introduction || row.introduction.trim() === '') return res.json([]);
      return res.json([{ id: surahId, prefaceSubTitle: '', prefaceText: row.introduction, suraId: surahId }]);
    }

    const row = one(
      quranDb,
      'SELECT introduction FROM surahs WHERE number = ? LIMIT 1',
      surahId,
    );
    if (!row || !row.introduction || row.introduction.trim() === '') return res.json([]);
    res.json([{ id: surahId, prefaceSubTitle: '', prefaceText: row.introduction, suraId: surahId }]);
  }),
);

// ─── Appendices ───

router.get(
  '/appendices',
  route((req, res) => {
    const table = asBool(req.query.malayalam) ? 'malayalam_appendices' : 'appendices';
    res.json(all(quranDb, `SELECT * FROM ${table} ORDER BY number ASC`));
  }),
);

router.get(
  '/appendices/:number',
  route((req, res) => {
    const number = asInt(req.params.number, 'number');
    const table = asBool(req.query.malayalam) ? 'malayalam_appendices' : 'appendices';
    const row = one(quranDb, `SELECT * FROM ${table} WHERE number = ? LIMIT 1`, number);
    res.json(notFound(row, `appendix ${number} not found`));
  }),
);

// ─── Foreword ───

router.get(
  '/foreword',
  route((_req, res) => {
    const row = one(quranDb, 'SELECT * FROM foreword LIMIT 1');
    res.json(row);
  }),
);

// ─── Malayalam preface (MlPrefaceDbHelper) ───

router.get(
  '/ml-preface',
  route((_req, res) => {
    const row = one(quranDb, 'SELECT * FROM malayalam_foreword LIMIT 1');
    res.json(row);
  }),
);

// ─── Authors ───

router.get(
  '/authors',
  route((req, res) => {
    const table = asBool(req.query.malayalam) ? 'malayalam_authors' : 'authors';
    res.json(all(quranDb, `SELECT * FROM ${table} ORDER BY is_verified DESC, id ASC`));
  }),
);

// ─── About author (Malayalam only) ───

router.get(
  '/about-author',
  route((_req, res) => {
    res.json(all(quranDb, 'SELECT * FROM malayalam_about_translator'));
  }),
);

// ─── English translator ───

router.get(
  '/translator',
  route((_req, res) => {
    res.json(all(quranDb, 'SELECT * FROM translator'));
  }),
);

// ─── Works of reference ───

router.get(
  '/works-of-reference',
  route((_req, res) => {
    res.json(all(quranDb, 'SELECT * FROM worksofreference ORDER BY is_verified DESC, id ASC'));
  }),
);

// ─── Contact ───

router.get(
  '/contact',
  route((req, res) => {
    const table = asBool(req.query.malayalam)
      ? 'malayalam_contact_us'
      : 'contact_us_content';
    res.json(one(quranDb, `SELECT * FROM ${table} LIMIT 1`));
  }),
);

router.get(
  '/contact/english',
  route((_req, res) => {
    const row = one(quranDb, 'SELECT * FROM contact_us_content LIMIT 1');
    res.json(row);
  }),
);

router.get(
  '/contact/info',
  route((_req, res) => {
    // ContactDbHelper.getContactInfo() queries a `contact_us` table that is
    // not present in the shipped db; the Dart code catches the error and
    // returns an empty list.
    if (!tableExists('contact_us')) return res.json([]);
    res.json(all(quranDb, 'SELECT * FROM contact_us'));
  }),
);

// ─── Help ───

router.get(
  '/help',
  route((_req, res) => {
    // HelpDbHelper.getHelpInfo() queries a `help` table that is not present
    // in the shipped db; the Dart code catches the error and returns [].
    if (!tableExists('help')) return res.json([]);
    res.json(all(quranDb, 'SELECT * FROM help'));
  }),
);

export default router;
