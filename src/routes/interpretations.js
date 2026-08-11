import { Router } from 'express';
import { quranDb, all, one } from '../db/index.js';
import { asInt, asBool, route } from '../utils.js';

const router = Router();

export const interpretationRange = (surah, malayalam) => {
  const row = malayalam
    ? one(
        quranDb,
        `SELECT MIN(footnote_number) AS min_num, MAX(footnote_number) AS max_num
         FROM malayalam_footnotes WHERE surah_number = ?`,
        surah,
      )
    : one(
        quranDb,
        `SELECT MIN(footnote_number) AS min_num, MAX(footnote_number) AS max_num
         FROM footnotes WHERE surah_number = ?`,
        surah,
      );

  return { min: row?.min_num ?? -1, max: row?.max_num ?? -1 };
};

router.get(
  '/surahs/:surah/interpretations/range',
  route((req, res) => {
    res.json(interpretationRange(asInt(req.params.surah, 'surah'), asBool(req.query.malayalam)));
  }),
);

router.get(
  '/surahs/:surah/interpretations/:number',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const number = asInt(req.params.number, 'number');

    // malayalam_footnotes is numbered from 1 within each surah, so
    // (surah_number, footnote_number) identifies a single row.
    if (asBool(req.query.malayalam)) {
      return res.json(
        all(
          quranDb,
          `SELECT * FROM malayalam_footnotes
           WHERE surah_number = ? AND footnote_number = ?
           ORDER BY id ASC LIMIT 1`,
          surah,
          number,
        ),
      );
    }

    res.json(
      all(
        quranDb,
        'SELECT * FROM footnotes WHERE surah_number = ? AND footnote_number = ?',
        surah,
        number,
      ),
    );
  }),
);

export default router;
