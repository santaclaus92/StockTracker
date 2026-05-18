import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

const VALID_TYPES = [
  'price_above', 'price_below',
  'pct_change_above', 'pct_change_below',
  'volume_spike',
  'rsi_above', 'rsi_below',
  'macd_crossover', 'macd_crossunder',
  '52w_high', '52w_low',
];

const VALID_CHANNELS = ['dashboard', 'email', 'telegram', 'both'];

// GET /api/conditions?symbol=1155.KL
router.get('/', async (req, res) => {
  try {
    let result;
    if (req.query.symbol) {
      const stockRes = await db.execute({
        sql:  'SELECT id FROM stocks WHERE symbol = ?',
        args: [req.query.symbol.toUpperCase()],
      });
      const stock = stockRes.rows[0];
      if (!stock) return res.json([]);
      result = await db.execute({
        sql:  'SELECT * FROM conditions WHERE stock_id = ? ORDER BY created_at DESC',
        args: [stock.id],
      });
    } else {
      result = await db.execute(`
        SELECT c.*, s.symbol, s.name
        FROM conditions c
        JOIN stocks s ON s.id = c.stock_id
        ORDER BY c.created_at DESC
      `);
    }
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/conditions
router.post('/', async (req, res) => {
  const { symbol, type, threshold, label, logic, channel } = req.body;
  if (!symbol || !type) return res.status(400).json({ error: 'symbol and type required' });
  if (!VALID_TYPES.includes(type)) return res.status(400).json({ error: `Invalid type. Valid: ${VALID_TYPES.join(', ')}` });
  if (channel && !VALID_CHANNELS.includes(channel)) return res.status(400).json({ error: 'Invalid channel' });

  try {
    const stockRes = await db.execute({
      sql:  'SELECT id FROM stocks WHERE symbol = ?',
      args: [symbol.toUpperCase()],
    });
    const stock = stockRes.rows[0];
    if (!stock) return res.status(404).json({ error: 'Stock not found' });

    const result = await db.execute({
      sql:  'INSERT INTO conditions (stock_id, type, threshold, label, logic, channel) VALUES (?, ?, ?, ?, ?, ?)',
      args: [stock.id, type, threshold ?? null, label || null, logic || 'AND', channel || 'dashboard'],
    });
    res.json({ id: Number(result.lastInsertRowid) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /api/conditions/:id
router.put('/:id', async (req, res) => {
  const { type, threshold, label, logic, channel, active } = req.body;
  try {
    const existingRes = await db.execute({
      sql:  'SELECT * FROM conditions WHERE id = ?',
      args: [req.params.id],
    });
    const existing = existingRes.rows[0];
    if (!existing) return res.status(404).json({ error: 'Not found' });

    await db.execute({
      sql:  'UPDATE conditions SET type=?, threshold=?, label=?, logic=?, channel=?, active=? WHERE id=?',
      args: [
        type      ?? existing.type,
        threshold ?? existing.threshold,
        label     ?? existing.label,
        logic     ?? existing.logic,
        channel   ?? existing.channel,
        active    ?? existing.active,
        req.params.id,
      ],
    });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/conditions/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.execute({ sql: 'DELETE FROM conditions WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
