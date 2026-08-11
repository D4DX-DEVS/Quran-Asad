import { Router } from 'express';
import { quranDb, all, one } from '../db/index.js';
import { asInt, asBool, notFound, route } from '../utils.js';

const router = Router();

// Malayalam surah rows carry no ayah count, so it is joined in from `surahs`
// exactly as the Malayalam surah list is assembled on the client.
const malayalamSurahsSql = (where = '') => `
  SELECT ml.*,
         s.arabic_name AS script_arabic_name,
         COALESCE(s.ayath_count, 0) AS ayath_count
  FROM malayalam_surahs ml
  LEFT JOIN surahs s ON ml.chapter_number = s.number
  ${where}
  ORDER BY ml.chapter_number ASC
`;

router.get(
  '/surahs',
  route((req, res) => {
    if (asBool(req.query.malayalam)) {
      return res.json(all(quranDb, malayalamSurahsSql()));
    }
    res.json(all(quranDb, 'SELECT * FROM surahs ORDER BY number ASC'));
  }),
);

router.get(
  '/surahs/:number',
  route((req, res) => {
    const number = asInt(req.params.number, 'number');

    if (asBool(req.query.malayalam)) {
      const row = one(
        quranDb,
        `${malayalamSurahsSql('WHERE ml.chapter_number = ?')} LIMIT 1`,
        number,
      );
      return res.json(notFound(row, `surah ${number} not found`));
    }

    const row = one(quranDb, 'SELECT * FROM surahs WHERE number = ? LIMIT 1', number);
    res.json(notFound(row, `surah ${number} not found`));
  }),
);

router.get(
  '/juzs',
  route((_req, res) => {
    res.json(all(quranDb, 'SELECT * FROM juzzs ORDER BY custom_id ASC'));
  }),
);

router.get(
  '/hizbs',
  route((_req, res) => {
    res.json(all(quranDb, 'SELECT * FROM hizbs ORDER BY custom_id ASC'));
  }),
);

export default router;
