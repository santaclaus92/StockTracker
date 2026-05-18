import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { PORT, CRON_SECRET, FETCH_INTERVAL_MINUTES } from './config.js';
import { startScheduler } from './services/scheduler.js';
import { fetchFavourites } from './services/fetcher.js';
import { evaluateAllConditions } from './services/alertService.js';

import stocksRouter     from './routes/stocks.js';
import favouritesRouter from './routes/favourites.js';
import conditionsRouter from './routes/conditions.js';
import alertsRouter     from './routes/alerts.js';
import backtestRouter   from './routes/backtest.js';
import chartRouter      from './routes/chart.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use('/api/stocks',     stocksRouter);
app.use('/api/favourites', favouritesRouter);
app.use('/api/conditions', conditionsRouter);
app.use('/api/alerts',     alertsRouter);
app.use('/api/backtest',   backtestRouter);
app.use('/api/chart',      chartRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Vercel Cron endpoint — replaces node-cron in serverless
app.all('/api/cron/refresh', async (req, res) => {
  if (CRON_SECRET && req.headers['authorization'] !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    await fetchFavourites();
    await evaluateAllConditions();
    res.json({ ok: true, ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Local dev only — start HTTP server + node-cron scheduler
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Bursa Monitor backend → http://localhost:${PORT}`);
    startScheduler();
  });
}

export default app;
