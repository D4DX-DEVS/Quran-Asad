import { Router } from 'express';
import { all, one, hasCollection } from '../db/index.js';
import { asInt, asBool, notFound, route } from '../utils.js';

const router = Router();

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
  route(async (req, res) => {
    const surahId = asInt(req.params.surahId, 'surahId');

    const row = asBool(req.query.malayalam)
      ? await one(
          'malayalam_surahs',
          { chapter_number: surahId },
          { projection: { introduction: 1 } },
        )
      : await one('surahs', { number: surahId }, { projection: { introduction: 1 } });

    if (!row || !row.introduction || row.introduction.trim() === '') return res.json([]);
    res.json([
      { id: surahId, prefaceSubTitle: '', prefaceText: row.introduction, suraId: surahId },
    ]);
  }),
);

// ─── Appendices ───

router.get(
  '/appendices',
  route(async (req, res) => {
    const collection = asBool(req.query.malayalam) ? 'malayalam_appendices' : 'appendices';
    res.json(await all(collection, {}, { sort: { number: 1 } }));
  }),
);

router.get(
  '/appendices/:number',
  route(async (req, res) => {
    const number = asInt(req.params.number, 'number');
    const collection = asBool(req.query.malayalam) ? 'malayalam_appendices' : 'appendices';
    const row = await one(collection, { number });
    res.json(notFound(row, `appendix ${number} not found`));
  }),
);

// ─── Foreword ───

router.get(
  '/foreword',
  route(async (_req, res) => {
    res.json(await one('foreword'));
  }),
);

// ─── Malayalam preface (MlPrefaceDbHelper) ───

router.get(
  '/ml-preface',
  route(async (_req, res) => {
    res.json(await one('malayalam_foreword'));
  }),
);

// ─── Authors ───

router.get(
  '/authors',
  route(async (req, res) => {
    const collection = asBool(req.query.malayalam) ? 'malayalam_authors' : 'authors';
    res.json(await all(collection, {}, { sort: { is_verified: -1, id: 1 } }));
  }),
);

// ─── About author (Malayalam only) ───

router.get(
  '/about-author',
  route(async (_req, res) => {
    res.json(await all('malayalam_about_translator'));
  }),
);

// ─── English translator ───

router.get(
  '/translator',
  route(async (_req, res) => {
    res.json(await all('translator'));
  }),
);

// ─── Works of reference ───

router.get(
  '/works-of-reference',
  route(async (_req, res) => {
    res.json(await all('worksofreference', {}, { sort: { is_verified: -1, id: 1 } }));
  }),
);

// ─── Contact ───

router.get(
  '/contact',
  route(async (req, res) => {
    const collection = asBool(req.query.malayalam)
      ? 'malayalam_contact_us'
      : 'contact_us_content';
    res.json(await one(collection));
  }),
);

router.get(
  '/contact/english',
  route(async (_req, res) => {
    res.json(await one('contact_us_content'));
  }),
);

router.get(
  '/contact/info',
  route(async (_req, res) => {
    // ContactDbHelper.getContactInfo() queries a `contact_us` table that was
    // not present in the source sqlite file, so nothing was migrated for it;
    // the Dart code catches the error and returns an empty list.
    if (!(await hasCollection('contact_us'))) return res.json([]);
    res.json(await all('contact_us'));
  }),
);

// ─── Help ───

router.get(
  '/help',
  route(async (_req, res) => {
    // HelpDbHelper.getHelpInfo() queries a `help` table that was likewise not
    // present in the source, so the Dart fallback of [] applies.
    if (!(await hasCollection('help'))) return res.json([]);
    res.json(await all('help'));
  }),
);

export default router;
