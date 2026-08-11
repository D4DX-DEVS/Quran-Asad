import 'dotenv/config';
import './dns.js';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import surahs from './routes/surahs.js';
import verses from './routes/verses.js';
import interpretations from './routes/interpretations.js';
import search from './routes/search.js';
import content from './routes/content.js';
import tajweed from './routes/tajweed.js';
import mushaf from './routes/mushaf.js';
import { connect, closeAll } from './db/index.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

app.use(cors());
app.use(morgan('dev'));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const api = express.Router();
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
