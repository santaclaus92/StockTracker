import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// GET /api/favourites
router.get('/', async (_req, res) => {
  try {
    const result = await db.execute(`
      SELECT s.id, s.symbol, s.name, s.sector,
             lp.price, lp.open, lp.high, lp.low,
             lp.week52_high, lp.week52_low, lp.volume, lp.pct_change, lp.updated_at,
             f.added_at
      FROM favourites f
      JOIN stocks s ON s.id = f.stock_id
      LEFT JOIN latest_price lp ON lp.stock_id = s.id
      ORDER BY s.name ASC
    `);
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/favourites/:symbol
router.post('/:symbol', async (req, res) => {
  try {
    const stockRes = await db.execute({
      sql:  'SELECT id FROM stocks WHERE symbol = ?',
      args: [req.params.symbol.toUpperCase()],
    });
    const stock = stockRes.rows[0];
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    await db.execute({ sql: 'INSERT OR IGNORE INTO favourites (stock_id) VALUES (?)', args: [stock.id] });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/favourites/:symbol
router.delete('/:symbol', async (req, res) => {
  try {
    const stockRes = await db.execute({
      sql:  'SELECT id FROM stocks WHERE symbol = ?',
      args: [req.params.symbol.toUpperCase()],
    });
    const stock = stockRes.rows[0];
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    await db.execute({ sql: 'DELETE FROM favourites WHERE stock_id = ?', args: [stock.id] });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
