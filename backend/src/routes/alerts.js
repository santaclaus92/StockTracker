import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const limit     = Math.min(200, parseInt(req.query.limit || '50', 10));
    const dismissed = req.query.dismissed === 'true' ? 1 : 0;
    const { rows } = await db.execute({
      sql: `
        SELECT al.*, s.symbol, s.name FROM alerts_log al
        LEFT JOIN stocks s ON s.id = al.stock_id
        WHERE al.dismissed = ?
        ORDER BY al.triggered_at DESC LIMIT ?
      `,
      args: [dismissed, limit],
    });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/count', async (_req, res) => {
  try {
    const { rows } = await db.execute({
      sql: 'SELECT COUNT(*) AS n FROM alerts_log WHERE dismissed = 0',
      args: [],
    });
    res.json({ count: parseInt(rows[0].n, 10) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/:id/dismiss', async (req, res) => {
  try {
    await db.execute({
      sql: 'UPDATE alerts_log SET dismissed = 1 WHERE id = ?',
      args: [req.params.id],
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/dismiss-all', async (_req, res) => {
  try {
    await db.execute({
      sql: 'UPDATE alerts_log SET dismissed = 1 WHERE dismissed = 0',
      args: [],
    });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
