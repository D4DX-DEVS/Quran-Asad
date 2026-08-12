import { Router } from 'express';
import { col, all, one } from '../db/index.js';
import { asInt, notFound, route } from '../utils.js';

const router = Router();

// `SELECT suraid, data … GROUP BY suraid` took the value of an arbitrary row
// per surah; picking the lowest `id` makes that deterministic.
const glyphsByLine = (line) =>
  col('mushaf_pages')
    .aggregate([
      { $match: { line } },
      { $sort: { id: 1 } },
      { $group: { _id: '$suraid', data: { $first: '$data' } } },
      { $project: { _id: 0, suraid: '$_id', data: 1 } },
      { $sort: { suraid: 1 } },
    ])
    .toArray();

// The mushaf fonts are downloaded as zips; this is the list still to fetch.
// `f0` is the sentinel for "no font", and fontstatus 0 means not yet bundled.
router.get(
  '/mushaf/font-zips',
  route(async (_req, res) => {
    const names = await col('mushaf_linewise_page').distinct('fontzip', {
      fontstatus: 0,
      fontzip: { $ne: 'f0' },
    });
    res.json(names.filter((name) => name != null).map(String).sort());
  }),
);

router.get(
  '/mushaf/pages/meta',
  route(async (_req, res) => {
    res.json(await all('mushaf_ayawise_page', {}, { sort: { p_id: 1 } }));
  }),
);

router.get(
  '/mushaf/pages/:page/lines',
  route(async (req, res) => {
    const page = asInt(req.params.page, 'page');
    res.json(await all('mushaf_pages', { pageid: page }, { sort: { id: 1 } }));
  }),
);

router.get(
  '/mushaf/pages/:page/meta',
  route(async (req, res) => {
    const page = asInt(req.params.page, 'page');
    const row = await one('mushaf_ayawise_page', { p_id: page });
    res.json(notFound(row, `page meta ${page} not found`));
  }),
);

router.get(
  '/mushaf/pages/ayas',
  route(async (req, res) => {
    const startAya = asInt(req.query.start, 'start');
    const endAya = asInt(req.query.end, 'end');
    if (startAya <= 0 || endAya < startAya) return res.json([]);
    res.json(
      await all(
        'mushaf_aya',
        { aya_id: { $gte: startAya, $lte: endAya }, aya_no: { $gt: 0 } },
        { projection: { aya_id: 1, s_no: 1, aya_no: 1 }, sort: { aya_id: 1 } },
      ),
    );
  }),
);

router.get(
  '/mushaf/surahs/glyphs',
  route(async (_req, res) => {
    res.json(await glyphsByLine(-1));
  }),
);

router.get(
  '/mushaf/surahs/:surah/glyph',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const row = await one(
      'mushaf_pages',
      { suraid: surah, line: -1 },
      { projection: { data: 1 } },
    );
    res.json({ data: row?.data ?? '' });
  }),
);

router.get(
  '/mushaf/bismillah-glyphs',
  route(async (_req, res) => {
    res.json(await glyphsByLine(0));
  }),
);

router.get(
  '/mushaf/surahs/:surah/bismillah-glyph',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const row = await one(
      'mushaf_pages',
      { suraid: surah, line: 0 },
      { projection: { data: 1 } },
    );
    res.json({ data: row?.data ?? '' });
  }),
);

router.get(
  '/mushaf/juzs/first-pages',
  route(async (_req, res) => {
    res.json(
      await col('mushaf_ayawise_page')
        .aggregate([
          { $group: { _id: '$j_no', first_page: { $min: '$p_id' } } },
          { $project: { _id: 0, j_no: '$_id', first_page: 1 } },
          { $sort: { j_no: 1 } },
        ])
        .toArray(),
    );
  }),
);

router.get(
  '/mushaf/juzs/:juz/name',
  route((req, res) => {
    asInt(req.params.juz, 'juz');
    // Juz names lived in a `t_juznames` table absent from the shipped mushaf.db,
    // so nothing was migrated for it; the Dart repository fell back to an empty
    // name rather than erroring.
    res.json({ name: '' });
  }),
);

router.get(
  '/mushaf/ayas/:continuousAyaId/page',
  route(async (req, res) => {
    const continuesAyaId = asInt(req.params.continuousAyaId, 'continuousAyaId');
    if (continuesAyaId <= 0) return res.json({ page: 0 });
    const row = await one(
      'mushaf_ayawise_page',
      { s_aya: { $lte: continuesAyaId }, e_aya: { $gte: continuesAyaId } },
      { projection: { p_id: 1 } },
    );
    res.json({ page: row?.p_id ?? 0 });
  }),
);

router.get(
  '/mushaf/ayas/continuous-id',
  route(async (req, res) => {
    const surah = asInt(req.query.surah, 'surah');
    const aya = asInt(req.query.aya, 'aya');
    const row = await one(
      'mushaf_aya',
      { s_no: surah, aya_no: aya },
      { projection: { aya_id: 1 } },
    );
    res.json({ ayaId: row?.aya_id ?? 0 });
  }),
);

router.get(
  '/mushaf/surahs/:surah/first-page',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');

    // The sqlite version joined every aya of the surah against the page ranges
    // and took the lowest page. Aya ids run contiguously within a surah, so
    // matching the pages that overlap [min, max] finds the same set.
    const [bounds] = await col('mushaf_aya')
      .aggregate([
        { $match: { s_no: surah, aya_no: { $gt: 0 } } },
        { $group: { _id: null, min: { $min: '$aya_id' }, max: { $max: '$aya_id' } } },
      ])
      .toArray();

    if (!bounds) return res.json({ page: 1 });

    const [page] = await col('mushaf_ayawise_page')
      .aggregate([
        { $match: { s_aya: { $lte: bounds.max }, e_aya: { $gte: bounds.min } } },
        { $group: { _id: null, first_page: { $min: '$p_id' } } },
      ])
      .toArray();

    res.json({ page: page?.first_page ?? 1 });
  }),
);

router.get(
  '/mushaf/surahs/:surah/continuous-aya-ids',
  route(async (req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const rows = await all(
      'mushaf_aya',
      { s_no: surah, aya_no: { $gt: 0 } },
      { projection: { aya_id: 1 }, sort: { aya_no: 1 } },
    );
    res.json(rows.map((r) => r.aya_id));
  }),
);

router.get(
  '/mushaf/ayas/:continuousAyaId/info',
  route(async (req, res) => {
    const continuousAyaId = asInt(req.params.continuousAyaId, 'continuousAyaId');
    const row = await one(
      'mushaf_aya',
      { aya_id: continuousAyaId },
      { projection: { s_no: 1, aya_no: 1 } },
    );
    res.json({ suraNo: row?.s_no ?? 1, ayaNo: row?.aya_no ?? 1 });
  }),
);

export default router;
