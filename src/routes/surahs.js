import { Router } from 'express';
import { col, all, one } from '../db/index.js';
import { asInt, asBool, notFound, route } from '../utils.js';

const router = Router();

// `introduction` and `body_raw` hold the full article text for a surah — about
// 6.5 KB a row, three quarters of the list payload. The list only feeds the
// surah index (names, translation, ayah count), no client reads either field
// from it, and the introduction has its own route in /prefaces/:surahId. The
// single-surah routes below still return the whole row.
const LIST_OMITS = { introduction: 0, body_raw: 0 };

// Malayalam surah rows carry no ayah count, so it is joined in from `surahs`
// exactly as the Malayalam surah list is assembled on the client.
const malayalamSurahs = (match = {}, omit = {}) =>
  col('malayalam_surahs')
    .aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'surahs',
          localField: 'chapter_number',
          foreignField: 'number',
          as: 'script',
        },
      },
      {
        $addFields: {
          script_arabic_name: {
            $ifNull: [{ $arrayElemAt: ['$script.arabic_name', 0] }, null],
          },
          ayath_count: { $ifNull: [{ $arrayElemAt: ['$script.ayath_count', 0] }, 0] },
        },
      },
      { $project: { _id: 0, script: 0, ...omit } },
      { $sort: { chapter_number: 1 } },
    ])
    .toArray();

router.get(
  '/surahs',
  route(async (req, res) => {
    if (asBool(req.query.malayalam)) {
      return res.json(await malayalamSurahs({}, LIST_OMITS));
    }
    res.json(await all('surahs', {}, { projection: LIST_OMITS, sort: { number: 1 } }));
  }),
);

router.get(
  '/surahs/:number',
  route(async (req, res) => {
    const number = asInt(req.params.number, 'number');

    if (asBool(req.query.malayalam)) {
      const [row] = await malayalamSurahs({ chapter_number: number });
      return res.json(notFound(row, `surah ${number} not found`));
    }

    const row = await one('surahs', { number });
    res.json(notFound(row, `surah ${number} not found`));
  }),
);

router.get(
  '/juzs',
  route(async (_req, res) => {
    res.json(await all('juzzs', {}, { sort: { custom_id: 1 } }));
  }),
);

router.get(
  '/hizbs',
  route(async (_req, res) => {
    res.json(await all('hizbs', {}, { sort: { custom_id: 1 } }));
  }),
);

export default router;
