import { Router } from 'express';
import { all } from '../db/index.js';
import { asInt, requireQuery, route } from '../utils.js';

const router = Router();

router.get(
  '/tajweed/words',
  route(async (req, res) => {
    const surah = asInt(requireQuery(req, 'surah'), 'surah');
    const verseFrom = asInt(requireQuery(req, 'verseFrom'), 'verseFrom');
    const verseTo = asInt(requireQuery(req, 'verseTo'), 'verseTo');

    res.json(
      await all(
        'tajweed_words',
        { surah_no: surah, ayah_no: { $gte: verseFrom, $lte: verseTo } },
        { sort: { ayah_no: 1, word_pos: 1 } },
      ),
    );
  }),
);

router.get(
  '/tajweed/image-urls',
  route(async (_req, res) => {
    const rows = await all('tajweed_words', {}, { projection: { image_url: 1 } });
    res.json(rows.map((r) => r.image_url || '').filter((url) => url !== ''));
  }),
);

export default router;
