import { Router } from 'express';
import db from '../db/database.js';
import { fetchAll, fetchHistory } from '../services/fetcher.js';

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
