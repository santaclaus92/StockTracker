import yahooFinance from 'yahoo-finance2';
import db from '../db/database.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function upsertLatest(stockId, quote) {
  const now = new Date().toISOString();
  await db.execute({
    sql: `INSERT INTO latest_price (stock_id, price, open, high, low, week52_high, week52_low, volume, pct_change, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(stock_id) DO UPDATE SET
            price=excluded.price, open=excluded.open, high=excluded.high, low=excluded.low,
            week52_high=excluded.week52_high, week52_low=excluded.week52_low,
            volume=excluded.volume, pct_change=excluded.pct_change, updated_at=excluded.updated_at`,
    args: [
      stockId,
      quote.regularMarketPrice       ?? null,
      quote.regularMarketOpen        ?? null,
      quote.regularMarketDayHigh     ?? null,
      quote.regularMarketDayLow      ?? null,
      quote.fiftyTwoWeekHigh         ?? null,
      quote.fiftyTwoWeekLow          ?? null,
      quote.regularMarketVolume      ?? null,
      quote.regularMarketChangePercent ?? null,
      now,
    ],
  });

  await db.execute({
    sql: `INSERT OR IGNORE INTO price_history (stock_id, ts, open, high, low, close, volume)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [
      stockId,
      now,
      quote.regularMarketOpen    ?? null,
      quote.regularMarketDayHigh ?? null,
      quote.regularMarketDayLow  ?? null,
      quote.regularMarketPrice   ?? null,
      quote.regularMarketVolume  ?? null,
    ],
  });
}

export async function fetchStock(symbol, stockId) {
  try {
    const quote = await yahooFinance.quote(symbol, {}, { validateResult: false });
    await upsertLatest(stockId, quote);
    return quote;
  } catch (err) {
    console.warn(`[fetcher] ${symbol}:`, err.message);
    return null;
  }
}

export async function fetchHistory(symbol, stockId, period1, period2 = new Date()) {
  try {
    const rows = await yahooFinance.historical(symbol, { period1, period2, interval: '1d' });
    for (const r of rows) {
      await db.execute({
        sql:  `INSERT OR IGNORE INTO price_history (stock_id, ts, open, high, low, close, volume)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [stockId, new Date(r.date).toISOString(), r.open, r.high, r.low, r.close, r.volume],
      });
    }
    return rows.length;
  } catch (err) {
    console.warn(`[history] ${symbol}:`, err.message);
    return 0;
  }
}

export async function fetchFavourites() {
  const result = await db.execute(`
    SELECT s.id, s.symbol FROM stocks s
    JOIN favourites f ON f.stock_id = s.id
  `);
  const favs = result.rows;
  for (const { id, symbol } of favs) {
    await fetchStock(symbol, id);
  }
  console.log(`[fetcher] refreshed ${favs.length} favourites`);
}

export async function fetchAll() {
  const result = await db.execute('SELECT id, symbol FROM stocks');
  const stocks = result.rows;
  let ok = 0;
  for (const { id, symbol } of stocks) {
    const res = await fetchStock(symbol, id);
    if (res) ok++;
    await sleep(100);
  }
  console.log(`[fetcher] refreshed ${ok}/${stocks.length} stocks`);
}
