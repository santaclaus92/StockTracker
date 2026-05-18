import { Router } from 'express';
import sql from '../db/database.js';

const router = Router();

// GET /api/stocks?page=1&limit=50&search=may&sector=Finance
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit || '50', 10));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const sector = req.query.sector || null;

    const rows = await sql`
      SELECT s.id, s.symbol, s.name, s.sector,
             lp.price, lp.open, lp.high, lp.low,
             lp.week52_high, lp.week52_low, lp.volume, lp.pct_change, lp.updated_at,
             CASE WHEN f.stock_id IS NOT NULL THEN 1 ELSE 0 END AS is_favourite
      FROM stocks s
      LEFT JOIN latest_price lp ON lp.stock_id = s.id
      LEFT JOIN favourites f ON f.stock_id = s.id
      WHERE (${search} IS NULL OR s.symbol ILIKE ${search} OR s.name ILIKE ${search})
        AND (${sector} IS NULL OR s.sector = ${sector})
      ORDER BY s.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ n }] = await sql`
      SELECT COUNT(*) AS n FROM stocks s
      WHERE (${search} IS NULL OR s.symbol ILIKE ${search} OR s.name ILIKE ${search})
        AND (${sector} IS NULL OR s.sector = ${sector})
    `;

    const total = parseInt(n, 10);
    res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/sectors
router.get('/sectors', async (_req, res) => {
  try {
    const rows = await sql`SELECT DISTINCT sector FROM stocks WHERE sector IS NOT NULL ORDER BY sector`;
    res.json(rows.map((r) => r.sector));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/:symbol
router.get('/:symbol', async (req, res) => {
  try {
    const [stock] = await sql`
      SELECT s.*, lp.price, lp.open, lp.high, lp.low,
             lp.week52_high, lp.week52_low, lp.volume, lp.pct_change, lp.updated_at,
             CASE WHEN f.stock_id IS NOT NULL THEN 1 ELSE 0 END AS is_favourite
      FROM stocks s
      LEFT JOIN latest_price lp ON lp.stock_id = s.id
      LEFT JOIN favourites f ON f.stock_id = s.id
      WHERE s.symbol = ${req.params.symbol.toUpperCase()}
    `;
    if (!stock) return res.status(404).json({ error: 'Not found' });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/:symbol/history
router.get('/:symbol/history', async (req, res) => {
  try {
    const [stock] = await sql`SELECT id FROM stocks WHERE symbol = ${req.params.symbol.toUpperCase()}`;
    if (!stock) return res.status(404).json({ error: 'Not found' });

    const { from, to } = req.query;
    const rows = await sql`
      SELECT ts, open, high, low, close, volume
      FROM price_history
      WHERE stock_id = ${stock.id}
        AND (${from ?? null} IS NULL OR ts >= ${from ?? null})
        AND (${to   ?? null} IS NULL OR ts <= ${to   ?? null})
      ORDER BY ts ASC LIMIT 2000
    `;
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/stocks/refresh
router.post('/refresh', async (_req, res) => {
  const { fetchAll } = await import('../services/fetcher.js');
  res.json({ message: 'Refresh started' });
  fetchAll().catch(console.error);
});

// POST /api/stocks
router.post('/', async (req, res) => {
  const { symbol, name, sector } = req.body;
  if (!symbol || !name) return res.status(400).json({ error: 'symbol and name required' });
  try {
    const [row] = await sql`
      INSERT INTO stocks (symbol, name, sector) VALUES (${symbol.toUpperCase()}, ${name}, ${sector ?? null})
      ON CONFLICT (symbol) DO NOTHING
      RETURNING *
    `;
    res.json(row ?? { symbol: symbol.toUpperCase(), name, sector });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
