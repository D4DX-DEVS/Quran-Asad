import { Router } from 'express';
import { quranDb, all } from '../db/index.js';
import { asInt, requireQuery, route } from '../utils.js';

const router = Router();

router.get(
  '/tajweed/words',
  route((req, res) => {
    const surah = asInt(requireQuery(req, 'surah'), 'surah');
    const verseFrom = asInt(requireQuery(req, 'verseFrom'), 'verseFrom');
    const verseTo = asInt(requireQuery(req, 'verseTo'), 'verseTo');

    res.json(
      all(
        quranDb,
        `SELECT * FROM tajweed_words
         WHERE surah_no = ? AND ayah_no >= ? AND ayah_no <= ?
         ORDER BY ayah_no ASC, word_pos ASC`,
        surah,
        verseFrom,
        verseTo,
      ),
    );
  }),
);

router.get(
  '/tajweed/image-urls',
  route((_req, res) => {
    const rows = all(quranDb, 'SELECT image_url FROM tajweed_words');
    res.json(rows.map((r) => r.image_url || '').filter((url) => url !== ''));
  }),
);

export default router;
