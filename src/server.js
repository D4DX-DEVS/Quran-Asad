import { config, assertServerConfig } from './config.js';
import './dns.js';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import surahs from './routes/surahs.js';
import verses from './routes/verses.js';
import interpretations from './routes/interpretations.js';
import search from './routes/search.js';
import content from './routes/content.js';
import tajweed from './routes/tajweed.js';
import mushaf from './routes/mushaf.js';
import { connect, closeAll, ping } from './db/index.js';

// Fails here, before anything binds, when the environment is incomplete.
assertServerConfig();

const app = express();
const port = config.port;

// Behind a proxy (Render, Fly, nginx, …) the client IP arrives in
// X-Forwarded-For; without this every request would rate-limit as one client.
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

app.use(cors());
app.use(morgan('dev'));

// Reports unhealthy when the database is unreachable, so a restart or an
// alert is triggered by a dropped connection rather than by a dead route.
app.get('/health', async (_req, res) => {
  const database = await ping();
  res.status(database ? 200 : 503).json({
    status: database ? 'ok' : 'degraded',
    database: database ? 'up' : 'down',
  });
});

const api = express.Router();

api.use(
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    limit: config.rateLimit.max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'too many requests' },
  }),
);

api.use(surahs);
api.use(verses);
api.use(interpretations);
api.use(search);
api.use(content);
api.use(tajweed);
api.use(mushaf);
app.use('/api/v1', api);

app.use((_req, res) => res.status(404).json({ error: 'not found' }));

app.use((err, _req, res, _next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message ?? 'internal server error' });
});

await connect();

const server = app.listen(port, () => {
  console.log(`MOQ backend listening on http://localhost:${port}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(async () => {
      await closeAll();
      process.exit(0);
    });
  });
}
