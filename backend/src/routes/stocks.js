import { Router } from 'express';
import db from '../db/database.js';
import { fetchAll, fetchHistory } from '../services/fetcher.js';
import { seriesRSI, seriesMACD, seriesBB, seriesSMA, seriesEMA } from '../services/indicators.js';

const router = Router();

// GET /api/stocks?page=1&limit=50&search=may&sector=Finance
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit || '50', 10));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const sector = req.query.sector || null;

    let where  = 'WHERE 1=1';
    const args = [];

    if (search) { where += ' AND (s.symbol LIKE ? OR s.name LIKE ?)'; args.push(search, search); }
    if (sector) { where += ' AND s.sector = ?'; args.push(sector); }

    const countRes = await db.execute({ sql: `SELECT COUNT(*) as n FROM stocks s ${where}`, args });
    const total    = Number(countRes.rows[0].n);

    const rowsRes = await db.execute({
      sql: `
        SELECT s.id, s.symbol, s.name, s.sector,
               lp.price, lp.open, lp.high, lp.low,
               lp.week52_high, lp.week52_low, lp.volume, lp.pct_change, lp.updated_at,
               CASE WHEN f.stock_id IS NOT NULL THEN 1 ELSE 0 END AS is_favourite
        FROM stocks s
        LEFT JOIN latest_price lp ON lp.stock_id = s.id
        LEFT JOIN favourites f ON f.stock_id = s.id
        ${where}
        ORDER BY s.name ASC
        LIMIT ? OFFSET ?
      `,
      args: [...args, limit, offset],
    });

    res.json({ data: rowsRes.rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (e) {
    console.error('[stocks] GET /', e);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stocks/sectors  — must be before /:symbol
router.get('/sectors', async (_req, res) => {
  try {
    const result = await db.execute(
      'SELECT DISTINCT sector FROM stocks WHERE sector IS NOT NULL ORDER BY sector'
    );
    res.json(result.rows.map((r) => r.sector));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stocks/:symbol
router.get('/:symbol', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `
        SELECT s.*, lp.price, lp.open, lp.high, lp.low,
               lp.week52_high, lp.week52_low, lp.volume, lp.pct_change, lp.updated_at,
               CASE WHEN f.stock_id IS NOT NULL THEN 1 ELSE 0 END AS is_favourite
        FROM stocks s
        LEFT JOIN latest_price lp ON lp.stock_id = s.id
        LEFT JOIN favourites f ON f.stock_id = s.id
        WHERE s.symbol = ?
      `,
      args: [req.params.symbol.toUpperCase()],
    });
    const stock = result.rows[0];
    if (!stock) return res.status(404).json({ error: 'Not found' });
    res.json(stock);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stocks/:symbol/history?from=2024-01-01&to=2024-12-31
router.get('/:symbol/history', async (req, res) => {
  try {
    const stockRes = await db.execute({
      sql:  'SELECT id FROM stocks WHERE symbol = ?',
      args: [req.params.symbol.toUpperCase()],
    });
    const stock = stockRes.rows[0];
    if (!stock) return res.status(404).json({ error: 'Not found' });

    const { from, to } = req.query;
    let sql  = 'SELECT ts, open, high, low, close, volume FROM price_history WHERE stock_id = ?';
    const args = [stock.id];
    if (from) { sql += ' AND ts >= ?'; args.push(from); }
    if (to)   { sql += ' AND ts <= ?'; args.push(to); }
    sql += ' ORDER BY ts ASC LIMIT 2000';

    let rows = (await db.execute({ sql, args })).rows;

    // If not enough history, fetch from Yahoo then re-query
    if (rows.length < 2 && from) {
      await fetchHistory(req.params.symbol.toUpperCase(), stock.id, from, to || new Date());
      rows = (await db.execute({ sql, args })).rows;
    }

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/stocks/:symbol/chart?interval=1d&days=90
router.get('/:symbol/chart', async (req, res) => {
  try {
    const symbol   = req.params.symbol.toUpperCase();
    const INTRADAY  = ['1h', '15m'];
    const interval  = INTRADAY.includes(req.query.interval) ? req.query.interval : '1d';
    const days     = Math.min(1825, Math.max(7, parseInt(req.query.days || '90', 10)));

    const stockRes = await db.execute({ sql: 'SELECT id FROM stocks WHERE symbol = ?', args: [symbol] });
    const stock = stockRes.rows[0];
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    // Calculate date range
    const to   = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - days);
    const fromISO = from.toISOString();

    // Fetch from Yahoo if we don't have interval-specific data covering the start date.
    const coverageRes = await db.execute({
      sql:  'SELECT MIN(ts) as oldest, COUNT(*) as n FROM price_history WHERE stock_id = ? AND interval = ?',
      args: [stock.id, interval],
    });
    const oldest = coverageRes.rows[0]?.oldest;
    const totalN = Number(coverageRes.rows[0]?.n ?? 0);
    const needsFetch = totalN < 5 || !oldest || new Date(oldest) > from;
    if (needsFetch) {
      await fetchHistory(symbol, stock.id, from, to, interval);
    }

    const rowsRes = await db.execute({
      sql:  `SELECT ts, open, high, low, close, volume FROM price_history
             WHERE stock_id = ? AND ts >= ? AND close IS NOT NULL AND interval = ?
             ORDER BY ts ASC LIMIT 2000`,
      args: [stock.id, fromISO, interval],
    });
    const raw = rowsRes.rows;
    if (raw.length < 2) return res.status(422).json({ error: 'Not enough data. Try a wider date range.' });

    // Convert ts → chart time.
    // 1d  → date string "YYYY-MM-DD"  (lightweight-charts renders as dates, no time shown)
    // 1h  → Unix seconds shifted to MYT (UTC+8, no DST) so the axis reads 09:00–17:00
    const MYT_OFFSET_S = 8 * 3600;
    const bars = raw.map((r) => ({
      time:   INTRADAY.includes(interval)
                ? Math.floor(new Date(r.ts).getTime() / 1000) + MYT_OFFSET_S
                : r.ts.slice(0, 10),
      open:   r.open,
      high:   r.high,
      low:    r.low,
      close:  r.close,
      volume: r.volume,
    }));

    const closes = bars.map((b) => b.close);
    const last   = bars[bars.length - 1];
    const first  = bars[0];

    // Reconstruct ISO strings for the summary (undo the MYT shift for 1h)
    const tsToISO = (t) => typeof t === 'string'
      ? new Date(t).toISOString()
      : new Date((t - MYT_OFFSET_S) * 1000).toISOString();

    res.json({
      ohlcv: bars,
      indicators: {
        rsi:  seriesRSI(bars),
        macd: seriesMACD(bars),
        bb:   seriesBB(bars),
        sma20: seriesSMA(bars, 20),
        sma50: seriesSMA(bars, 50),
        ema20: seriesEMA(bars, 20),
      },
      summary: {
        lastClose:  last.close,
        pctChange:  first.close ? ((last.close - first.close) / first.close) * 100 : 0,
        periodHigh: Math.max(...closes),
        periodLow:  Math.min(...closes),
        lastVolume: last.volume,
      },
      from:      tsToISO(first.time),
      to:        tsToISO(last.time),
      totalBars: bars.length,
    });
  } catch (e) {
    console.error('[chart]', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/stocks/refresh — manual full refresh
router.post('/refresh', async (_req, res) => {
  res.json({ message: 'Refresh started' });
  fetchAll().catch(console.error);
});

// POST /api/stocks — add a new stock manually
router.post('/', async (req, res) => {
  const { symbol, name, sector } = req.body;
  if (!symbol || !name) return res.status(400).json({ error: 'symbol and name required' });
  try {
    const result = await db.execute({
      sql:  'INSERT OR IGNORE INTO stocks (symbol, name, sector) VALUES (?, ?, ?)',
      args: [symbol.toUpperCase(), name, sector || null],
    });
    res.json({ id: Number(result.lastInsertRowid), symbol: symbol.toUpperCase(), name, sector });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;
