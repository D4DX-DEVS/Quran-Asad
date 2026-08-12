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

// Colour-coded Tajweed markup, one document per verse. Fetched a surah at a
// time — the whole book is ~5.5 MB, which is what this replaced.
router.get(
  '/tajweed/html',
  route(async (req, res) => {
    const surah = asInt(requireQuery(req, 'surah'), 'surah');
    res.json(
      await all(
        'tajweed_html',
        { surah_number: surah },
        {
          projection: { verse_key: 1, text_tajweed_html: 1 },
          sort: { verse_number: 1 },
        },
      ),
    );
  }),
);

// There is one row per word in the Qur'an (~77k), so the whole table is never
// returned at once: `limit` caps a page and `offset` walks it.
const MAX_IMAGE_URLS = 5000;

router.get(
  '/tajweed/image-urls',
  route(async (req, res) => {
    const requested =
      req.query.limit === undefined ? MAX_IMAGE_URLS : asInt(req.query.limit, 'limit');
    const limit = Math.min(Math.max(requested, 0), MAX_IMAGE_URLS);
    const offset =
      req.query.offset === undefined ? 0 : Math.max(asInt(req.query.offset, 'offset'), 0);

    const rows = await all(
      'tajweed_words',
      {},
      {
        projection: { image_url: 1 },
        sort: { surah_no: 1, ayah_no: 1, word_pos: 1 },
        skip: offset,
        limit,
      },
    );
    res.json(rows.map((r) => r.image_url || '').filter((url) => url !== ''));
  }),
);

export default router;
