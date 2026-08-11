import { Router } from 'express';
import { col, all } from '../db/index.js';
import { asInt, asBool, route } from '../utils.js';

const router = Router();

export const interpretationRange = async (surah, malayalam) => {
  const collection = malayalam ? 'malayalam_footnotes' : 'footnotes';
  const [row] = await col(collection)
    .aggregate([
      { $match: { surah_number: surah } },
      {
        $group: {
          _id: null,
          min_num: { $min: '$footnote_number' },
          max_num: { $max: '$footnote_number' },
        },
      },
    ])
    .toArray();

  return { min: row?.min_num ?? -1, max: row?.max_num ?? -1 };
};

router.get(
  '/surahs/:surah/interpretations/range',
  route(async (req, res) => {
    res.json(
      await interpretationRange(
        asInt(req.params.surah, 'surah'),
        asBool(req.query.malayalam),
      ),
    );
  }),
);

router.get(
  '/surahs/:surah/interpretations/:number',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const number = asInt(req.params.number, 'number');

    // malayalam_footnotes is numbered from 1 within each surah, so
    // (surah_number, footnote_number) identifies a single row.
    if (asBool(req.query.malayalam)) {
      return res.json(
        await all(
          'malayalam_footnotes',
          { surah_number: surah, footnote_number: number },
          { sort: { id: 1 }, limit: 1 },
        ),
      );
    }

    res.json(
      await all('footnotes', { surah_number: surah, footnote_number: number }),
    );
  }),
);

export default router;
