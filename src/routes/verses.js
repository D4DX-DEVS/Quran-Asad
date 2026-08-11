import { Router } from 'express';
import { all, one } from '../db/index.js';
import { contains } from '../search-text.js';
import { asInt, asBool, notFound, route } from '../utils.js';

const router = Router();

router.get(
  '/surahs/:surah/verses',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');

    if (asBool(req.query.malayalam)) {
      return res.json(
        await all(
          'malayalam_verses',
          { surah_id: surah, verse_number: { $ne: null } },
          { sort: { verse_number: 1 } },
        ),
      );
    }

    res.json(
      await all('verses', { surah_number: surah }, { sort: { verse_number: 1 } }),
    );
  }),
);

router.get(
  '/surahs/:surah/verses/:verse',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const verse = asInt(req.params.verse, 'verse');

    const row = asBool(req.query.malayalam)
      ? await one('malayalam_verses', { surah_id: surah, verse_number: verse })
      : await one('verses', { surah_number: surah, verse_number: verse });

    res.json(notFound(row, `verse ${surah}:${verse} not found`));
  }),
);

router.get(
  '/surahs/:surah/arabic',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    res.json(await all('quranayas', { suraid: surah }, { sort: { ayaid: 1 } }));
  }),
);

router.get(
  '/surahs/:surah/arabic/:verse',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const verse = asInt(req.params.verse, 'verse');
    const row = await one('quranayas', { suraid: surah, ayaid: verse });
    res.json(notFound(row, `arabic verse ${surah}:${verse} not found`));
  }),
);

// Verse numbers whose translation text carries this footnote's marker:
// `(N)` in the Asad text, `[^N]` in the Malayalam text.
router.get(
  '/surahs/:surah/footnotes/:footnote/verse-numbers',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const footnote = asInt(req.params.footnote, 'footnote');
    if (footnote <= 0) return res.json([]);

    if (asBool(req.query.malayalam)) {
      const rows = await all(
        'malayalam_verses',
        { surah_id: surah, malayalam_translation: contains(`[^${footnote}]`) },
        { projection: { verse_number: 1 }, sort: { verse_number: 1 } },
      );
      const numbers = rows.map((r) => r.verse_number).filter((n) => n > 0);
      return res.json(numbers.length > 0 ? numbers : [footnote]);
    }

    const rows = await all(
      'verses',
      { surah_number: surah, text: contains(`(${footnote})`) },
      { projection: { verse_number: 1 }, sort: { verse_number: 1 } },
    );
    res.json(rows.map((r) => r.verse_number).filter((n) => n > 0));
  }),
);

export default router;
