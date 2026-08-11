import { Router } from 'express';
import { mushafDb, all, one } from '../db/index.js';
import { asInt, notFound, route } from '../utils.js';

const router = Router();

router.get(
  '/mushaf/pages/meta',
  route((_req, res) => {
    res.json(all(mushafDb, 'SELECT * FROM t_ayawise_page ORDER BY p_id'));
  }),
);

router.get(
  '/mushaf/pages/:page/lines',
  route((req, res) => {
    const page = asInt(req.params.page, 'page');
    res.json(
      all(mushafDb, 'SELECT * FROM t_MushafPages WHERE pageid=? ORDER BY id', page),
    );
  }),
);

router.get(
  '/mushaf/pages/:page/meta',
  route((req, res) => {
    const page = asInt(req.params.page, 'page');
    const row = one(mushafDb, 'SELECT * FROM t_ayawise_page WHERE p_id=?', page);
    res.json(notFound(row, `page meta ${page} not found`));
  }),
);

router.get(
  '/mushaf/pages/ayas',
  route((req, res) => {
    const startAya = asInt(req.query.start, 'start');
    const endAya = asInt(req.query.end, 'end');
    if (startAya <= 0 || endAya < startAya) return res.json([]);
    res.json(
      all(
        mushafDb,
        `SELECT aya_id, s_no, aya_no FROM t_aya
         WHERE aya_id BETWEEN ? AND ? AND aya_no > 0 ORDER BY aya_id`,
        startAya,
        endAya,
      ),
    );
  }),
);

router.get(
  '/mushaf/surahs/glyphs',
  route((_req, res) => {
    res.json(
      all(
        mushafDb,
        'SELECT suraid, data FROM t_MushafPages WHERE line=-1 GROUP BY suraid ORDER BY suraid',
      ),
    );
  }),
);

router.get(
  '/mushaf/surahs/:surah/glyph',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const row = one(
      mushafDb,
      'SELECT data FROM t_MushafPages WHERE suraid=? AND line=-1 LIMIT 1',
      surah,
    );
    res.json({ data: row?.data ?? '' });
  }),
);

router.get(
  '/mushaf/bismillah-glyphs',
  route((_req, res) => {
    res.json(
      all(
        mushafDb,
        'SELECT suraid, data FROM t_MushafPages WHERE line=0 GROUP BY suraid ORDER BY suraid',
      ),
    );
  }),
);

router.get(
  '/mushaf/surahs/:surah/bismillah-glyph',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const row = one(
      mushafDb,
      'SELECT data FROM t_MushafPages WHERE suraid=? AND line=0 LIMIT 1',
      surah,
    );
    res.json({ data: row?.data ?? '' });
  }),
);

router.get(
  '/mushaf/juzs/first-pages',
  route((_req, res) => {
    res.json(
      all(
        mushafDb,
        'SELECT j_no, MIN(p_id) AS first_page FROM t_ayawise_page GROUP BY j_no ORDER BY j_no',
      ),
    );
  }),
);

router.get(
  '/mushaf/juzs/:juz/name',
  route((req, res) => {
    const juz = asInt(req.params.juz, 'juz');
    // t_juznames is absent from the shipped mushaf.db copy; mirror the Dart
    // repository's try/catch fallback of an empty name rather than erroring.
    try {
      const row = one(mushafDb, 'SELECT j_name FROM t_juznames WHERE j_no=?', juz);
      res.json({ name: row?.j_name ?? '' });
    } catch {
      res.json({ name: '' });
    }
  }),
);

router.get(
  '/mushaf/ayas/:continuousAyaId/page',
  route((req, res) => {
    const continuesAyaId = asInt(req.params.continuousAyaId, 'continuousAyaId');
    if (continuesAyaId <= 0) return res.json({ page: 0 });
    const row = one(
      mushafDb,
      'SELECT p_id FROM t_ayawise_page WHERE s_aya<=? AND e_aya>=? LIMIT 1',
      continuesAyaId,
      continuesAyaId,
    );
    res.json({ page: row?.p_id ?? 0 });
  }),
);

router.get(
  '/mushaf/ayas/continuous-id',
  route((req, res) => {
    const surah = asInt(req.query.surah, 'surah');
    const aya = asInt(req.query.aya, 'aya');
    const row = one(
      mushafDb,
      'SELECT aya_id FROM t_aya WHERE s_no=? AND aya_no=? LIMIT 1',
      surah,
      aya,
    );
    res.json({ ayaId: row?.aya_id ?? 0 });
  }),
);

router.get(
  '/mushaf/surahs/:surah/first-page',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    const row = one(
      mushafDb,
      `SELECT MIN(p.p_id) AS first_page
       FROM t_ayawise_page p
       JOIN t_aya a ON a.aya_id BETWEEN p.s_aya AND p.e_aya
       WHERE a.s_no=? AND a.aya_no>0`,
      surah,
    );
    res.json({ page: row?.first_page ?? 1 });
  }),
);

router.get(
  '/mushaf/surahs/:surah/continuous-aya-ids',
  route((req, res) => {
    const surah = asInt(req.params.surah, 'surah');
    res.json(
      all(
        mushafDb,
        'SELECT aya_id FROM t_aya WHERE s_no=? AND aya_no > 0 ORDER BY aya_no',
        surah,
      ).map((r) => r.aya_id),
    );
  }),
);

router.get(
  '/mushaf/ayas/:continuousAyaId/info',
  route((req, res) => {
    const continuousAyaId = asInt(req.params.continuousAyaId, 'continuousAyaId');
    const row = one(
      mushafDb,
      'SELECT s_no, aya_no FROM t_aya WHERE aya_id=? LIMIT 1',
      continuousAyaId,
    );
    res.json({ suraNo: row?.s_no ?? 1, ayaNo: row?.aya_no ?? 1 });
  }),
);

export default router;
