import { Router } from 'express';
import sql from '../db/database.js';

const router = Router();

const VALID_TYPES = [
  'price_above','price_below','pct_change_above','pct_change_below',
  'volume_spike','rsi_above','rsi_below','macd_crossover','macd_crossunder',
  '52w_high','52w_low',
];
const VALID_CHANNELS = ['dashboard','email','telegram','both'];

router.get('/', async (req, res) => {
  try {
    let rows;
    if (req.query.symbol) {
      const [stock] = await sql`SELECT id FROM stocks WHERE symbol = ${req.query.symbol.toUpperCase()}`;
      if (!stock) return res.json([]);
      rows = await sql`SELECT * FROM conditions WHERE stock_id = ${stock.id} ORDER BY created_at DESC`;
    } else {
      rows = await sql`
        SELECT c.*, s.symbol, s.name FROM conditions c
        JOIN stocks s ON s.id = c.stock_id ORDER BY c.created_at DESC
      `;
    }
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { symbol, type, threshold, label, logic, channel } = req.body;
  if (!symbol || !type) return res.status(400).json({ error: 'symbol and type required' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `Invalid type` });
  if (channel && !VALID_CHANNELS.includes(channel)) return res.status(400).json({ error: `Invalid channel` });
  try {
    const [stock] = await sql`SELECT id FROM stocks WHERE symbol = ${symbol.toUpperCase()}`;
    if (!stock) return res.status(404).json({ error: 'Stock not found' });
    const [row] = await sql`
      INSERT INTO conditions (stock_id, type, threshold, label, logic, channel)
      VALUES (${stock.id}, ${type}, ${threshold ?? null}, ${label || null}, ${logic || 'AND'}, ${channel || 'dashboard'})
      RETURNING id
    `;
    res.json({ id: row.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  try {
    const [existing] = await sql`SELECT * FROM conditions WHERE id = ${req.params.id}`;
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const { type, threshold, label, logic, channel, active } = req.body;
    await sql`
      UPDATE conditions SET
        type      = ${type      ?? existing.type},
        threshold = ${threshold ?? existing.threshold},
        label     = ${label     ?? existing.label},
        logic     = ${logic     ?? existing.logic},
        channel   = ${channel   ?? existing.channel},
        active    = ${active    ?? existing.active}
      WHERE id = ${req.params.id}
    `;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await sql`DELETE FROM conditions WHERE id = ${req.params.id}`;
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
