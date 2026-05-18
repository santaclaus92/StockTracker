import db from '../db/database.js';
import { computeRSI, computeMACD } from './indicators.js';

// Evaluate a condition on a historical snapshot
function evalCondition(cond, bar, closes) {
  const { type, threshold } = cond;

  switch (type) {
    case 'price_above':       return bar.close > threshold;
    case 'price_below':       return bar.close < threshold;
    case 'pct_change_above':  return bar.pct_change > threshold;
    case 'pct_change_below':  return bar.pct_change < threshold;
    case 'rsi_above': {
      const rsi = computeRSI(closes);
      return rsi !== null && rsi > threshold;
    }
    case 'rsi_below': {
      const rsi = computeRSI(closes);
      return rsi !== null && rsi < threshold;
    }
    case 'macd_crossover': {
      const m = computeMACD(closes);
      return m !== null && m.MACD > m.signal;
    }
    case 'macd_crossunder': {
      const m = computeMACD(closes);
      return m !== null && m.MACD < m.signal;
    }
    case '52w_high':
      return bar.close >= bar.rolling_high;
    case '52w_low':
      return bar.close <= bar.rolling_low;
    default:
      return false;
  }
}

function applyLogic(results, logic) {
  if (!results.length) return false;
  return logic === 'OR'
    ? results.some(Boolean)
    : results.every(Boolean);
}

export async function runBacktest({ stockId, startDate, endDate, entryConditions, exitConditions, capital, stopLoss, takeProfit }) {
  const { rows: bars } = await db.execute({
    sql: `
      SELECT ts, open, high, low, close, volume
      FROM price_history
      WHERE stock_id = ? AND ts BETWEEN ? AND ? AND close IS NOT NULL
      ORDER BY ts ASC
    `,
    args: [stockId, startDate, endDate],
  });

  if (bars.length < 2) return { error: 'Not enough historical data for this range.' };

  // Pre-compute % change
  for (let i = 0; i < bars.length; i++) {
    bars[i].pct_change = i === 0 ? 0 : ((bars[i].close - bars[i - 1].close) / bars[i - 1].close) * 100;
  }

  const equity = [{ date: bars[0].ts, value: capital }];
  const trades = [];
  let cash = capital;
  let position = null; // { shares, entryPrice, entryDate }
  let peakEquity = capital;
  let maxDrawdown = 0;

  for (let i = 1; i < bars.length; i++) {
    const bar     = bars[i];
    const closes  = bars.slice(0, i + 1).map((b) => b.close);
    const current = cash + (position ? position.shares * bar.close : 0);

    peakEquity  = Math.max(peakEquity, current);
    maxDrawdown = Math.max(maxDrawdown, (peakEquity - current) / peakEquity);

    if (!position) {
      // Check entry
      const entryLogic  = entryConditions[0]?.logic || 'AND';
      const entrySignal = applyLogic(
        entryConditions.map((c) => evalCondition(c, bar, closes)),
        entryLogic
      );

      if (entrySignal && cash > 0) {
        const shares       = Math.floor(cash / bar.close);
        position           = { shares, entryPrice: bar.close, entryDate: bar.ts };
        cash              -= shares * bar.close;
      }
    } else {
      // Check stop-loss / take-profit
      const pnlPct = ((bar.close - position.entryPrice) / position.entryPrice) * 100;
      const slHit  = stopLoss   != null && pnlPct <= -Math.abs(stopLoss);
      const tpHit  = takeProfit != null && pnlPct >= Math.abs(takeProfit);

      // Check exit condition
      const exitLogic   = exitConditions[0]?.logic || 'AND';
      const exitSignal  = exitConditions.length > 0
        ? applyLogic(exitConditions.map((c) => evalCondition(c, bar, closes)), exitLogic)
        : false;

      if (slHit || tpHit || exitSignal) {
        const proceeds = position.shares * bar.close;
        cash          += proceeds;
        trades.push({
          entryDate:  position.entryDate,
          exitDate:   bar.ts,
          entryPrice: position.entryPrice,
          exitPrice:  bar.close,
          shares:     position.shares,
          pnl:        proceeds - position.shares * position.entryPrice,
          pnlPct,
          exitReason: slHit ? 'stop_loss' : tpHit ? 'take_profit' : 'condition',
        });
        position = null;
      }
    }

    equity.push({ date: bar.ts, value: current });
  }

  // Force-close any open position at last bar
  if (position) {
    const last     = bars[bars.length - 1];
    const proceeds = position.shares * last.close;
    cash          += proceeds;
    trades.push({
      entryDate:  position.entryDate,
      exitDate:   last.ts,
      entryPrice: position.entryPrice,
      exitPrice:  last.close,
      shares:     position.shares,
      pnl:        proceeds - position.shares * position.entryPrice,
      pnlPct:     ((last.close - position.entryPrice) / position.entryPrice) * 100,
      exitReason: 'end_of_period',
    });
    equity[equity.length - 1].value = cash;
  }

  const wins     = trades.filter((t) => t.pnl > 0);
  const losses   = trades.filter((t) => t.pnl <= 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);

  return {
    summary: {
      startCapital: capital,
      endCapital:   cash,
      totalReturn:  ((cash - capital) / capital) * 100,
      totalPnl,
      numTrades:    trades.length,
      winRate:      trades.length ? (wins.length / trades.length) * 100 : 0,
      maxDrawdown:  maxDrawdown * 100,
      avgWin:       wins.length  ? wins.reduce((s, t)   => s + t.pnl, 0) / wins.length   : 0,
      avgLoss:      losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0,
    },
    trades,
    equity,
  };
}
