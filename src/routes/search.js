import { Router } from 'express';
import { col, all, one } from '../db/index.js';
import { normalizeArabic, pad, contains } from '../search-text.js';
import { asBool, asInt, requireQuery, route } from '../utils.js';
import { interpretationRange } from './interpretations.js';

const router = Router();

// The sqlite searches padded the column with spaces and matched `'% term %'`,
// i.e. whole words. The migration stored those padded, punctuation-stripped,
// lowercased columns, so the query side only has to pad the needle.
const needle = (q) => contains(pad(q));

const limitOf = (req, fallback) =>
  req.query.limit === undefined ? fallback : asInt(req.query.limit, 'limit');

router.get(
  '/search/verses',
  route(async (req, res) => {
    const q = needle(requireQuery(req, 'q').toLowerCase());
    const limit = limitOf(req, 50);

    if (asBool(req.query.malayalam)) {
      return res.json(
        await all(
          'malayalam_verses',
          { search_text: q },
          {
            projection: { surah_id: 1, verse_number: 1, malayalam_translation: 1 },
            limit,
          },
        ),
      );
    }

    res.json(
      await all(
        'verses',
        { search_text: q },
        { projection: { surah_number: 1, verse_number: 1, text: 1 }, limit },
      ),
    );
  }),
);

router.get(
  '/search/arabic',
  route(async (req, res) => {
    const q = normalizeArabic(requireQuery(req, 'q').trim());
    if (q === '') return res.json([]);
    const limit = limitOf(req, 100);

    const malayalam = asBool(req.query.malayalam);
    const translations = malayalam ? 'malayalam_verses' : 'verses';
    const surahField = malayalam ? 'surah_id' : 'surah_number';
    const textField = malayalam ? 'malayalam_translation' : 'text';

    res.json(
      await col('quranayas')
        .aggregate([
          { $match: { search_arabic: needle(q) } },
          { $limit: limit },
          {
            $lookup: {
              from: translations,
              let: { surah: '$suraid', aya: '$ayaid' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: [`$${surahField}`, '$$surah'] },
                        { $eq: ['$verse_number', '$$aya'] },
                      ],
                    },
                  },
                },
                { $limit: 1 },
                { $project: { _id: 0, [textField]: 1 } },
              ],
              as: 'translation',
            },
          },
          {
            $project: {
              _id: 0,
              suraid: 1,
              ayaid: 1,
              arabic_text: '$AyaHText',
              translation_text: {
                $ifNull: [{ $arrayElemAt: [`$translation.${textField}`, 0] }, ''],
              },
            },
          },
        ])
        .toArray(),
    );
  }),
);

router.get(
  '/search/interpretations',
  route(async (req, res) => {
    const q = needle(requireQuery(req, 'q').toLowerCase());
    const limit = limitOf(req, 30);

    if (!asBool(req.query.malayalam)) {
      const footnotes = await all(
        'footnotes',
        { search_text: q },
        { projection: { surah_number: 1, footnote_number: 1, text: 1 }, limit },
      );

      // The correlated subquery that resolved each footnote's verse, one
      // lookup per row.
      return res.json(
        await Promise.all(
          footnotes.map(async (row) => {
            const verse = await one(
              'verses',
              {
                surah_number: row.surah_number,
                text: contains(`(${row.footnote_number})`),
              },
              { projection: { verse_number: 1 } },
            );
            return { ...row, verse_number: verse?.verse_number ?? -1 };
          }),
        ),
      );
    }

    const footnotes = await all(
      'malayalam_footnotes',
      { search_content: q },
      { projection: { id: 1, footnote_number: 1, content: 1 }, limit },
    );

    // malayalam_footnotes has two numbering groups: rows where id ==
    // footnote_number belong to surahs 1-6 with globally unique [^N] markers,
    // and rows where id != footnote_number belong to surahs 7-114 where the
    // markers restart. The same footnote_number exists in both groups, so the
    // lookup must be constrained to the right group to resolve the verse.
    const rows = await Promise.all(
      footnotes.map(async ({ id, footnote_number, content }) => {
        const group = id === footnote_number ? { $lte: 6 } : { $gte: 7 };
        const verse = await one(
          'malayalam_verses',
          {
            malayalam_translation: contains(`[^${footnote_number}]`),
            surah_id: group,
          },
          { projection: { surah_id: 1, verse_number: 1 }, sort: { surah_id: 1, verse_number: 1 } },
        );
        return {
          footnote_number,
          content,
          surah_number: verse?.surah_id ?? -1,
          verse_number: verse?.verse_number ?? -1,
        };
      }),
    );

    // Footnote numbers are stored globally but displayed per surah, using the
    // same offset the surah screen applies: display = global - surahMin + 1.
    const surahMin = new Map();
    for (const row of rows) {
      if (row.surah_number > 0 && row.footnote_number > 0) {
        if (!surahMin.has(row.surah_number)) {
          const { min } = await interpretationRange(row.surah_number, true);
          surahMin.set(row.surah_number, min === -1 ? row.footnote_number : min);
        }
        const display = row.footnote_number - surahMin.get(row.surah_number) + 1;
        if (display > 0) row.footnote_number = display;
      }
    }

    res.json(rows);
  }),
);

export default router;
