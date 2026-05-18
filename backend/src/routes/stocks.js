import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// GET /api/stocks?page=1&limit=50&search=may&sector=Finance
router.get('/', async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit  = Math.min(100, parseInt(req.query.limit || '50', 10));
    const offset = (page - 1) * limit;
    const search = req.query.search ? `%${req.query.search}%` : null;
    const sector = req.query.sector || null;

    const { rows } = await db.execute({
      sql: `
        SELECT s.id, s.symbol, s.name, s.sector,
               lp.price, lp.open, lp.high, lp.low,
               lp.week52_high, lp.week52_low, lp.volume, lp.pct_change, lp.updated_at,
               CASE WHEN f.stock_id IS NOT NULL THEN 1 ELSE 0 END AS is_favourite
        FROM stocks s
        LEFT JOIN latest_price lp ON lp.stock_id = s.id
        LEFT JOIN favourites f ON f.stock_id = s.id
        WHERE (? IS NULL OR s.symbol LIKE ? OR s.name LIKE ?)
          AND (? IS NULL OR s.sector = ?)
        ORDER BY s.name ASC
        LIMIT ? OFFSET ?
      `,
      args: [search, search, search, sector, sector, limit, offset],
    });

    const { rows: countRows } = await db.execute({
      sql: `
        SELECT COUNT(*) AS n FROM stocks s
        WHERE (? IS NULL OR s.symbol LIKE ? OR s.name LIKE ?)
          AND (? IS NULL OR s.sector = ?)
      `,
      args: [search, search, search, sector, sector],
    });

    const total = parseInt(countRows[0].n, 10);
    res.json({ data: rows, total, page, limit, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/sectors
router.get('/sectors', async (_req, res) => {
  try {
    const { rows } = await db.execute({
      sql: 'SELECT DISTINCT sector FROM stocks WHERE sector IS NOT NULL ORDER BY sector',
      args: [],
    });
    res.json(rows.map((r) => r.sector));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/:symbol
router.get('/:symbol', async (req, res) => {
  try {
    const { rows } = await db.execute({
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
    const stock = rows[0];
    if (!stock) return res.status(404).json({ error: 'Not found' });
    res.json(stock);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/stocks/:symbol/history
router.get('/:symbol/history', async (req, res) => {
  try {
    const { rows: stockRows } = await db.execute({
      sql: 'SELECT id FROM stocks WHERE symbol = ?',
      args: [req.params.symbol.toUpperCase()],
    });
    const stock = stockRows[0];
    if (!stock) return res.status(404).json({ error: 'Not found' });

    const { from, to } = req.query;
    const { rows } = await db.execute({
      sql: `
        SELECT ts, open, high, low, close, volume
        FROM price_history
        WHERE stock_id = ?
          AND (? IS NULL OR ts >= ?)
          AND (? IS NULL OR ts <= ?)
        ORDER BY ts ASC LIMIT 2000
      `,
      args: [stock.id, from ?? null, from ?? null, to ?? null, to ?? null],
    });
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
    const { rows } = await db.execute({
      sql: `
        INSERT INTO stocks (symbol, name, sector) VALUES (?, ?, ?)
        ON CONFLICT (symbol) DO NOTHING
        RETURNING *
      `,
      args: [symbol.toUpperCase(), name, sector ?? null],
    });
    res.json(rows[0] ?? { symbol: symbol.toUpperCase(), name, sector });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

export default router;
