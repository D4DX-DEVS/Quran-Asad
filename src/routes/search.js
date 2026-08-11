import { Router } from 'express';
import { quranDb, all } from '../db/index.js';
import { asBool, asInt, requireQuery, route } from '../utils.js';
import { interpretationRange } from './interpretations.js';

const router = Router();

// Space-padded LIKE with a punctuation-stripping REPLACE chain, so a word sitting
// next to `.,;:!?()` still matches on a whole-word search.
const stripPunctuation = (column) => `
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    LOWER(${column}),
    '.', ' '), ',', ' '), ';', ' '), ':', ' '),
    '!', ' '), '?', ' '), ')', ' '), '(', ' ')
`;

// Mirrors normalizeArabic(): 13 diacritic removals, then 4 Alef variants → ا.
const normalizedArabic = (column) => `
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
    ${column},
    char(1611), ''), char(1612), ''), char(1613), ''),
    char(1614), ''), char(1615), ''), char(1616), ''),
    char(1617), ''), char(1618), ''), char(1619), ''),
    char(1620), ''), char(1621), ''),
    char(1648), ''), char(1600), ''),
    char(1570), char(1575)), char(1571), char(1575)),
    char(1573), char(1575)), char(1649), char(1575))
`;

const ALEF = 0x627;
const ALEF_VARIANTS = new Set([0x622, 0x623, 0x625, 0x671]);
const DIACRITICS = new Set([
  ...Array.from({ length: 0x655 - 0x64b + 1 }, (_, i) => 0x64b + i),
  0x670,
  0x640,
]);

const normalizeArabic = (text) =>
  Array.from(text.trim())
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (DIACRITICS.has(code)) return '';
      return ALEF_VARIANTS.has(code) ? String.fromCharCode(ALEF) : ch;
    })
    .join('');

const limitOf = (req, fallback) =>
  req.query.limit === undefined ? fallback : asInt(req.query.limit, 'limit');

router.get(
  '/search/verses',
  route((req, res) => {
    const pattern = `% ${requireQuery(req, 'q').toLowerCase()} %`;
    const limit = limitOf(req, 50);

    if (asBool(req.query.malayalam)) {
      return res.json(
        all(
          quranDb,
          `SELECT surah_id, verse_number, malayalam_translation
           FROM malayalam_verses
           WHERE ' ' || malayalam_translation || ' ' LIKE ?
           LIMIT ?`,
          pattern,
          limit,
        ),
      );
    }

    res.json(
      all(
        quranDb,
        `SELECT surah_number, verse_number, text
         FROM verses
         WHERE ' ' || ${stripPunctuation('text')} || ' ' LIKE ?
         LIMIT ?`,
        pattern,
        limit,
      ),
    );
  }),
);

router.get(
  '/search/arabic',
  route((req, res) => {
    const q = normalizeArabic(requireQuery(req, 'q'));
    if (q === '') return res.json([]);
    const pattern = `% ${q} %`;
    const limit = limitOf(req, 100);

    const translationJoin = asBool(req.query.malayalam)
      ? `LEFT JOIN malayalam_verses t
           ON t.surah_id = q.suraid AND t.verse_number = q.ayaid`
      : `LEFT JOIN verses t
           ON t.surah_number = q.suraid AND t.verse_number = q.ayaid`;
    const translationColumn = asBool(req.query.malayalam)
      ? 't.malayalam_translation'
      : 't.text';

    res.json(
      all(
        quranDb,
        `SELECT q.suraid, q.ayaid,
                q.AyaHText AS arabic_text,
                COALESCE(${translationColumn}, '') AS translation_text
         FROM quranayas q
         ${translationJoin}
         WHERE ' ' || ${normalizedArabic('q.AyaHText')} || ' ' LIKE ?
         LIMIT ?`,
        pattern,
        limit,
      ),
    );
  }),
);

router.get(
  '/search/interpretations',
  route((req, res) => {
    const pattern = `% ${requireQuery(req, 'q').toLowerCase()} %`;
    const limit = limitOf(req, 30);

    if (!asBool(req.query.malayalam)) {
      return res.json(
        all(
          quranDb,
          `SELECT f.surah_number, f.footnote_number, f.text,
                  COALESCE((
                    SELECT v.verse_number FROM verses v
                    WHERE v.surah_number = f.surah_number
                      AND v.text LIKE '%(' || f.footnote_number || ')%'
                    LIMIT 1
                  ), -1) AS verse_number
           FROM footnotes f
           WHERE ' ' || ${stripPunctuation('f.text')} || ' ' LIKE ?
           LIMIT ?`,
          pattern,
          limit,
        ),
      );
    }

    // malayalam_footnotes has two numbering groups: rows where id ==
    // footnote_number belong to surahs 1-6 with globally unique [^N] markers,
    // and rows where id != footnote_number belong to surahs 7-114 where the
    // markers restart. The same footnote_number exists in both groups, so the
    // subquery must be constrained to the right group to resolve the verse.
    const groupFilter = `
      AND (
        (f.id = f.footnote_number AND v.surah_id <= 6)
        OR
        (f.id != f.footnote_number AND v.surah_id >= 7)
      )
    `;

    const rows = all(
      quranDb,
      `SELECT
         f.footnote_number,
         f.content,
         COALESCE((
           SELECT v.surah_id FROM malayalam_verses v
           WHERE v.malayalam_translation LIKE '%[^' || f.footnote_number || ']%'
             ${groupFilter}
           ORDER BY v.surah_id, v.verse_number LIMIT 1
         ), -1) AS surah_number,
         COALESCE((
           SELECT v.verse_number FROM malayalam_verses v
           WHERE v.malayalam_translation LIKE '%[^' || f.footnote_number || ']%'
             ${groupFilter}
           ORDER BY v.surah_id, v.verse_number LIMIT 1
         ), -1) AS verse_number
       FROM malayalam_footnotes f
       WHERE ' ' || REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
               f.content,
               ',', ' '), '.', ' '), ')', ' '), '(', ' '), ';', ' '),
               char(10), ' ') || ' '
             LIKE ?
       LIMIT ?`,
      pattern,
      limit,
    );

    // Footnote numbers are stored globally but displayed per surah, using the
    // same offset the surah screen applies: display = global - surahMin + 1.
    const surahMin = new Map();
    for (const row of rows) {
      if (row.surah_number > 0 && row.footnote_number > 0) {
        if (!surahMin.has(row.surah_number)) {
          const { min } = interpretationRange(row.surah_number, true);
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
