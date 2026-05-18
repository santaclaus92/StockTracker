import { Router } from 'express';
import db from '../db/database.js';
import { runBacktest } from '../services/backtestService.js';
import { fetchHistory } from '../services/fetcher.js';

const router = Router();

// POST /api/backtest
// Body: { symbol, startDate, endDate, entryConditions, exitConditions, capital, stopLoss, takeProfit }
router.post('/', async (req, res) => {
  const {
    symbol,
    startDate,
    endDate,
    entryConditions = [],
    exitConditions  = [],
    capital         = 10000,
    stopLoss        = null,
    takeProfit      = null,
  } = req.body;

  if (!symbol || !startDate) return res.status(400).json({ error: 'symbol and startDate required' });

  const stock = db.prepare('SELECT id FROM stocks WHERE symbol = ?').get(symbol.toUpperCase());
  if (!stock) return res.status(404).json({ error: 'Stock not found' });

  // Ensure historical data exists; fetch if needed
  const existingCount = db.prepare(
    'SELECT COUNT(*) as n FROM price_history WHERE stock_id = ? AND ts >= ?'
  ).get(stock.id, startDate).n;

  if (existingCount < 5) {
    await fetchHistory(symbol.toUpperCase(), stock.id, startDate, endDate || new Date());
  }

  const result = runBacktest({
    stockId:         stock.id,
    startDate,
    endDate:         endDate || new Date().toISOString(),
    entryConditions,
    exitConditions,
    capital:         parseFloat(capital),
    stopLoss:        stopLoss  != null ? parseFloat(stopLoss)  : null,
    takeProfit:      takeProfit != null ? parseFloat(takeProfit) : null,
  });

  res.json(result);
});

export default router;
