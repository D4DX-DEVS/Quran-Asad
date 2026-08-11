import { Router } from 'express';
import { col, all } from '../db/index.js';
import { normalizeArabic, pad, contains } from '../search-text.js';
import { asBool, asInt, requireQuery, route } from '../utils.js';

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
      // The correlated subquery that resolved each footnote's verse, run as one
      // joined pipeline instead of a round trip per matched footnote.
      return res.json(
        await col('footnotes')
          .aggregate([
            { $match: { search_text: q } },
            { $limit: limit },
            {
              $lookup: {
                from: 'verses',
                let: { surah: '$surah_number', marker: '$footnote_number' },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ['$surah_number', '$$surah'] },
                          {
                            $gte: [
                              {
                                $indexOfCP: [
                                  '$text',
                                  { $concat: ['(', { $toString: '$$marker' }, ')'] },
                                ],
                              },
                              0,
                            ],
                          },
                        ],
                      },
                    },
                  },
                  { $limit: 1 },
                  { $project: { _id: 0, verse_number: 1 } },
                ],
                as: 'verse',
              },
            },
            {
              $project: {
                _id: 0,
                surah_number: 1,
                footnote_number: 1,
                text: 1,
                verse_number: {
                  $ifNull: [{ $arrayElemAt: ['$verse.verse_number', 0] }, -1],
                },
              },
            },
          ])
          .toArray(),
      );
    }

    // malayalam_footnotes has two numbering groups: rows where id ==
    // footnote_number belong to surahs 1-6 with globally unique [^N] markers,
    // and rows where id != footnote_number belong to surahs 7-114 where the
    // markers restart. The same footnote_number exists in both groups, so the
    // lookup must be constrained to the right group to resolve the verse.
    const rows = await col('malayalam_footnotes')
      .aggregate([
        { $match: { search_content: q } },
        { $limit: limit },
        {
          $lookup: {
            from: 'malayalam_verses',
            let: {
              marker: '$footnote_number',
              global: { $eq: ['$id', '$footnote_number'] },
            },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [
                      {
                        $gte: [
                          {
                            $indexOfCP: [
                              '$malayalam_translation',
                              { $concat: ['[^', { $toString: '$$marker' }, ']'] },
                            ],
                          },
                          0,
                        ],
                      },
                      {
                        $cond: [
                          '$$global',
                          { $lte: ['$surah_id', 6] },
                          { $gte: ['$surah_id', 7] },
                        ],
                      },
                    ],
                  },
                },
              },
              { $sort: { surah_id: 1, verse_number: 1 } },
              { $limit: 1 },
              { $project: { _id: 0, surah_id: 1, verse_number: 1 } },
            ],
            as: 'verse',
          },
        },
        {
          $project: {
            _id: 0,
            footnote_number: 1,
            content: 1,
            surah_number: { $ifNull: [{ $arrayElemAt: ['$verse.surah_id', 0] }, -1] },
            verse_number: { $ifNull: [{ $arrayElemAt: ['$verse.verse_number', 0] }, -1] },
          },
        },
      ])
      .toArray();

    // Footnote numbers are stored globally but displayed per surah, using the
    // same offset the surah screen applies: display = global - surahMin + 1.
    // One grouped query covers every surah the results landed in.
    const surahs = [...new Set(rows.map((r) => r.surah_number).filter((n) => n > 0))];
    const mins = await col('malayalam_footnotes')
      .aggregate([
        { $match: { surah_number: { $in: surahs } } },
        { $group: { _id: '$surah_number', min: { $min: '$footnote_number' } } },
      ])
      .toArray();
    const surahMin = new Map(mins.map((m) => [m._id, m.min]));

    for (const row of rows) {
      if (row.surah_number > 0 && row.footnote_number > 0) {
        const min = surahMin.get(row.surah_number) ?? row.footnote_number;
        const display = row.footnote_number - min + 1;
        if (display > 0) row.footnote_number = display;
      }
    }

    res.json(rows);
  }),
);

export default router;
