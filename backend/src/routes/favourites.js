import { Router } from 'express';
import sql from '../db/database.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const rows = await sql`
      SELECT s.id, s.symbol, s.name, s.sector,
             lp.price, lp.open, lp.high, lp.low,
             lp.week52_high, lp.week52_low, lp.volume, lp.pct_change, lp.updated_at,
             f.added_at
      FROM favourites f
      JOIN stocks s ON s.id = f.stock_id
      LEFT JOIN latest_price lp ON lp.stock_id = s.id
      ORDER BY s.name ASC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:symbol', async (req, res) => {
  try {
    const [stock] = await sql`SELECT id FROM stocks WHERE symbol = ${req.params.symbol.toUpperCase()}`;
    if (!stock) return res.status(404).json({ error: 'Stock not found' });
    await sql`INSERT INTO favourites (stock_id) VALUES (${stock.id}) ON CONFLICT DO NOTHING`;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:symbol', async (req, res) => {
  try {
    const [stock] = await sql`SELECT id FROM stocks WHERE symbol = ${req.params.symbol.toUpperCase()}`;
    if (!stock) return res.status(404).json({ error: 'Stock not found' });
    await sql`DELETE FROM favourites WHERE stock_id = ${stock.id}`;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
