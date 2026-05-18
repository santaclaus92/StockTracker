import { Router } from 'express';
import db from '../db/database.js';

const router = Router();

// GET /api/alerts?limit=50&dismissed=false
router.get('/', async (req, res) => {
  try {
    const limit     = Math.min(200, parseInt(req.query.limit || '50', 10));
    const dismissed = req.query.dismissed === 'true' ? 1 : 0;

    const result = await db.execute({
      sql: `
        SELECT al.*, s.symbol, s.name
        FROM alerts_log al
        LEFT JOIN stocks s ON s.id = al.stock_id
        WHERE al.dismissed = ?
        ORDER BY al.triggered_at DESC
        LIMIT ?
      `,
      args: [dismissed, limit],
    });
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/alerts/count — unread badge count
router.get('/count', async (_req, res) => {
  try {
    const result = await db.execute('SELECT COUNT(*) as n FROM alerts_log WHERE dismissed = 0');
    res.json({ count: Number(result.rows[0].n) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/alerts/:id/dismiss
router.post('/:id/dismiss', async (req, res) => {
  try {
    await db.execute({ sql: 'UPDATE alerts_log SET dismissed = 1 WHERE id = ?', args: [req.params.id] });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/alerts/dismiss-all
router.post('/dismiss-all', async (_req, res) => {
  try {
    await db.execute('UPDATE alerts_log SET dismissed = 1 WHERE dismissed = 0');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
