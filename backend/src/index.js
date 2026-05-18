import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { PORT } from './config.js';
import { startScheduler } from './services/scheduler.js';

import stocksRouter     from './routes/stocks.js';
import favouritesRouter from './routes/favourites.js';
import conditionsRouter from './routes/conditions.js';
import alertsRouter     from './routes/alerts.js';
import backtestRouter   from './routes/backtest.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/stocks',     stocksRouter);
app.use('/api/favourites', favouritesRouter);
app.use('/api/conditions', conditionsRouter);
app.use('/api/alerts',     alertsRouter);
app.use('/api/backtest',   backtestRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Cron endpoint for Vercel (replaces node-cron on serverless)
app.get('/api/cron/refresh', async (req, res) => {
  const { CRON_SECRET } = await import('./config.js');
  if (CRON_SECRET && req.headers['x-cron-secret'] !== CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  const { fetchFavourites } = await import('./services/fetcher.js');
  fetchFavourites().catch(console.error);
  res.json({ ok: true });
});

// Only start HTTP server when running locally (not on Vercel)
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Bursa Monitor backend → http://localhost:${PORT}`);
    startScheduler();
  });
}

export default app;
