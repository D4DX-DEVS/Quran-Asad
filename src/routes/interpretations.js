import { Router } from 'express';
import { col, all } from '../db/index.js';
import { asInt, asBool, route } from '../utils.js';

const router = Router();

const MALAYALAM_MARKER = /\[\^?(\d+)\]/g;

export const interpretationRange = async (surah, malayalam) => {
  // Malayalam footnotes are numbered per surah, but surah 1 also carries the
  // translator's introduction notes (numbers 1-5) that no verse references and
  // nothing displays — its verse notes are 6-9, matching Asad's 1-4. Deriving
  // the range from the markers actually present in the verses skips them. Every
  // other surah starts at 1 either way, so this only changes surah 1.
  if (malayalam) {
    const verses = await all(
      'malayalam_verses',
      { surah_id: surah },
      { projection: { malayalam_translation: 1 } },
    );

    const numbers = [];
    for (const verse of verses) {
      for (const [, n] of (verse.malayalam_translation ?? '').matchAll(MALAYALAM_MARKER)) {
        numbers.push(Number(n));
      }
    }

    if (numbers.length > 0) {
      return { min: Math.min(...numbers), max: Math.max(...numbers) };
    }
  }

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
