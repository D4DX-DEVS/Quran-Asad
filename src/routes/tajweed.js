import { Router } from 'express';
import { all } from '../db/index.js';
import { asInt, requireQuery, route } from '../utils.js';

const router = Router();

// Colour-coded Tajweed markup, one document per verse, fetched a surah at a
// time — the whole book is ~5.5 MB, which is what this replaced.
//
// This is the only Tajweed source now. The older renderer drew one CDN-hosted
// image per word, backed by a 77k-row table and served from /tajweed/words and
// /tajweed/image-urls; both were dropped along with the app code that had
// already stopped calling them.
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

export default router;
