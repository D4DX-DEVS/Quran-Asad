import { Router } from 'express';
import { quranDb, all, one } from '../db/index.js';
import { asInt, asBool, notFound, route } from '../utils.js';

const router = Router();

router.get(
  '/surahs/:surah/verses',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');

    if (asBool(req.query.malayalam)) {
      return res.json(
        all(
          quranDb,
          `SELECT * FROM malayalam_verses
           WHERE surah_id = ? AND verse_number IS NOT NULL
           ORDER BY verse_number ASC`,
          surah,
        ),
      );
    }

    res.json(
      all(
        quranDb,
        'SELECT * FROM verses WHERE surah_number = ? ORDER BY verse_number ASC',
        surah,
      ),
    );
  }),
);

router.get(
  '/surahs/:surah/verses/:verse',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const verse = asInt(req.params.verse, 'verse');

    const row = asBool(req.query.malayalam)
      ? one(
          quranDb,
          'SELECT * FROM malayalam_verses WHERE surah_id = ? AND verse_number = ? LIMIT 1',
          surah,
          verse,
        )
      : one(
          quranDb,
          'SELECT * FROM verses WHERE surah_number = ? AND verse_number = ? LIMIT 1',
          surah,
          verse,
        );

    res.json(notFound(row, `verse ${surah}:${verse} not found`));
  }),
);

router.get(
  '/surahs/:surah/arabic',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    res.json(
      all(quranDb, 'SELECT * FROM quranayas WHERE suraid = ? ORDER BY ayaid ASC', surah),
    );
  }),
);

router.get(
  '/surahs/:surah/arabic/:verse',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const verse = asInt(req.params.verse, 'verse');
    const row = one(
      quranDb,
      'SELECT * FROM quranayas WHERE suraid = ? AND ayaid = ? LIMIT 1',
      surah,
      verse,
    );
    res.json(notFound(row, `arabic verse ${surah}:${verse} not found`));
  }),
);

// Verse numbers whose translation text carries this footnote's marker:
// `(N)` in the Asad text, `[^N]` in the Malayalam text.
router.get(
  '/surahs/:surah/footnotes/:footnote/verse-numbers',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const footnote = asInt(req.params.footnote, 'footnote');
    if (footnote <= 0) return res.json([]);

    if (asBool(req.query.malayalam)) {
      const rows = all(
        quranDb,
        `SELECT verse_number FROM malayalam_verses
         WHERE surah_id = ? AND malayalam_translation LIKE ?
         ORDER BY verse_number ASC`,
        surah,
        `%[^${footnote}]%`,
      );
      const numbers = rows.map((r) => r.verse_number).filter((n) => n > 0);
      return res.json(numbers.length > 0 ? numbers : [footnote]);
    }

    const rows = all(
      quranDb,
      `SELECT verse_number FROM verses
       WHERE surah_number = ? AND text LIKE ?
       ORDER BY verse_number ASC`,
      surah,
      `%(${footnote})%`,
    );
    res.json(rows.map((r) => r.verse_number).filter((n) => n > 0));
  }),
);

export default router;
